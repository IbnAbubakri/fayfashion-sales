import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { balanceDue, formatNaira, lineTotal, normalizeQuantity, paymentLabel, paymentStatus, priceMarkup, reverseMarkup } from '../shared/pricing.js'
import { checkCredentials, clearSessionCookie, createSessionToken, credentialsConfigured, readSession, sessionCookie } from '../shared/auth.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DB_DIR = join(ROOT, 'data')
const DB_PATH = process.env.SALES_DB_PATH || join(DB_DIR, 'sales.db')
const PORT = Number(process.env.PORT || 4174)
const CATALOG_SOURCES = [
  { url: 'http://fayfashioncart.com.ng/products.json', timeoutMs: 8000 },
  { url: 'https://fayfashioncart.vercel.app/products.json', timeoutMs: 45000 },
]

await mkdir(dirname(DB_PATH), { recursive: true })
const db = new DatabaseSync(DB_PATH)
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_date TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    variant_id TEXT,
    variant_label TEXT,
    customer_name TEXT DEFAULT '',
    website_price REAL NOT NULL,
    actual_price REAL NOT NULL,
    amount_paid REAL NOT NULL,
    profit REAL NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
  CREATE INDEX IF NOT EXISTS idx_sales_product ON sales(product_name);
  CREATE TABLE IF NOT EXISTS capital (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contribution_date TEXT NOT NULL,
    amount REAL NOT NULL,
    source TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_capital_date ON capital(contribution_date);
`)

const saleColumns = db.prepare('PRAGMA table_info(sales)').all().map((column) => column.name)
if (!saleColumns.includes('customer_name')) {
  db.exec(`ALTER TABLE sales ADD COLUMN customer_name TEXT DEFAULT ''`)
}
if (!saleColumns.includes('quantity')) {
  db.exec(`ALTER TABLE sales ADD COLUMN quantity INTEGER DEFAULT 1`)
}

let catalogCache = { data: null, fetchedAt: 0 }

async function fetchCatalog() {
  if (catalogCache.data && Date.now() - catalogCache.fetchedAt < 5 * 60 * 1000) return catalogCache.data
  let lastError
  for (const source of CATALOG_SOURCES) {
    try {
      const res = await fetch(source.url, {
        headers: { 'cache-control': 'no-cache' },
        signal: AbortSignal.timeout(source.timeoutMs),
      })
      if (!res.ok) throw new Error(`${source.url} -> HTTP ${res.status}`)
      const data = await res.json()
      if (!Array.isArray(data.products)) throw new Error(`${source.url} has no products array`)
      catalogCache = { data, fetchedAt: Date.now() }
      return data
    } catch (err) {
      lastError = err
    }
  }
  if (catalogCache.data) return catalogCache.data
  throw lastError || new Error('Could not load catalogue')
}

function catalogOptions(product) {
  const options = Array.isArray(product.options) ? product.options : []
  return options.map((o) => {
    const basePrice = Number(o.price) > 0 ? Number(o.price) : Number(product.price) || 0
    const websitePrice = basePrice + priceMarkup(basePrice)
    return {
      id: String(o.id),
      label: String(o.label),
      websitePrice,
      actualPrice: reverseMarkup(websitePrice),
      inStock: o.in_stock,
    }
  })
}

function publicProduct(product) {
  const options = catalogOptions(product)
  const basePrice = Number(product.price) || 0
  const websitePrice = basePrice + priceMarkup(basePrice)
  const rawTo = Number(product.price_to) || 0
  const priceText = rawTo > basePrice
    ? `${formatNaira(websitePrice)} - ${formatNaira(rawTo + priceMarkup(rawTo))}`
    : formatNaira(websitePrice)
  return {
    id: String(product.id),
    name: String(product.name || ''),
    source: product.source || '',
    category: product.category || '',
    image: product.image || product.thumbnail || null,
    websitePrice,
    actualPrice: reverseMarkup(websitePrice),
    priceText,
    hasOptions: options.length > 0,
    options,
  }
}

function money(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n) : 0
}

// Returns null when absent (so the catalogue can fill it in) and false when invalid.
function readPrice(value) {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : false
}

// Returns 1 when absent; false when the shopper entered an invalid quantity.
function readQuantity(value) {
  if (value === undefined || value === null || value === '') return 1
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : false
}

function publicSale(row) {
  const websitePrice = Number(row.website_price) || 0
  const quantity = normalizeQuantity(row.quantity)
  const websiteTotal = lineTotal(websitePrice, quantity)
  const amountPaid = Number(row.amount_paid) || 0
  return {
    ...row,
    quantity,
    website_total: websiteTotal,
    actual_total: lineTotal(row.actual_price, quantity),
    customer_name: row.customer_name || '',
    balance_due: balanceDue(websiteTotal, amountPaid),
    payment_status: paymentStatus(websiteTotal, amountPaid),
  }
}

function publicCapital(row) {
  return {
    ...row,
    source: row.source || '',
    note: row.note || '',
  }
}

function send(res, status, body) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body)
  res.writeHead(status, {
    'content-type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(payload)
}

async function bodyJson(req) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  return raw ? JSON.parse(raw) : {}
}

const routes = {
  async '/api/health'() {
    return { ok: true, db: DB_PATH }
  },

  async '/api/products'() {
    const data = await fetchCatalog()
    return {
      syncedAt: data.synced_at || null,
      total: data.total || data.products.length,
      products: data.products.map(publicProduct),
    }
  },

  async '/api/sales/export'() {
    const rows = db.prepare(`
      SELECT sale_date, customer_name, product_name, variant_label, quantity,
             website_price, amount_paid, profit, note
      FROM sales ORDER BY sale_date DESC, id DESC
    `).all()
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [
      'Date,Customer,Product,Variant,Quantity,Unit Price,Total Price,Amount Paid,Balance Due,Payment Status,Profit,Note',
      ...rows.map((r) => {
        const total = lineTotal(r.website_price, r.quantity)
        const due = balanceDue(total, r.amount_paid)
        return [
          r.sale_date, r.customer_name || '', r.product_name, r.variant_label,
          r.quantity || 1, r.website_price, total, r.amount_paid, due,
          paymentLabel(paymentStatus(total, r.amount_paid)), r.profit, r.note,
        ].map(esc).join(',')
      }),
    ].join('\n')
    return csv
  },

  async '/api/capital'() {
    const rows = db.prepare('SELECT * FROM capital ORDER BY contribution_date DESC, id DESC').all().map(publicCapital)
    return { capital: rows }
  },
}

async function handleApi(req, res, pathname) {
  if (pathname.startsWith('/api/auth/')) {
    if (pathname === '/api/auth/session' && req.method === 'GET') {
      const username = readSession(req)
      return send(res, 200, { authenticated: Boolean(username), username: username || null })
    }
    if (pathname === '/api/auth/login' && req.method === 'POST') {
      if (!credentialsConfigured()) return send(res, 500, { error: 'Login is not configured.' })
      const b = await bodyJson(req)
      const username = String(b.username || '').trim()
      if (!checkCredentials(username, b.password)) return send(res, 401, { error: 'Incorrect username or password.' })
      res.setHeader('set-cookie', sessionCookie(createSessionToken(username)))
      return send(res, 200, { ok: true, username })
    }
    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      res.setHeader('set-cookie', clearSessionCookie())
      return send(res, 200, { ok: true })
    }
    return send(res, 405, { error: 'Method not allowed' })
  }

  // The catalogue, sale records, and CSV export all require a signed session.
  if (!readSession(req)) return send(res, 401, { error: 'Please sign in to continue.' })

  // Route map entries are GET-only; let writes fall through to the handlers below.
  const route = req.method === 'GET' ? routes[pathname] : null
  if (route) return send(res, 200, await route())

  if (pathname === '/api/sales' && req.method === 'GET') {
    const rows = db.prepare('SELECT * FROM sales ORDER BY sale_date DESC, id DESC').all().map(publicSale)
    return send(res, 200, { sales: rows })
  }

  if (pathname === '/api/sales' && req.method === 'POST') {
    const b = await bodyJson(req)
    const productId = String(b.productId || '')
    const variantId = b.variantId ? String(b.variantId) : null
    const saleDate = String(b.saleDate || '').slice(0, 10)
    const customerName = String(b.customerName || '').trim()
    const amountPaid = money(b.amountPaid)
    const quantity = readQuantity(b.quantity)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) return send(res, 400, { error: 'A valid sale date is required.' })
    if (!productId || !String(b.productName || '').trim()) return send(res, 400, { error: 'Choose a product.' })
    if (!Number.isFinite(Number(b.amountPaid)) || Number(b.amountPaid) < 0) return send(res, 400, { error: 'Amount paid is required.' })
    if (quantity === false) return send(res, 400, { error: 'Quantity must be a whole number of at least 1.' })

    let websitePrice = readPrice(b.websitePrice)
    let actualPrice = readPrice(b.actualPrice)
    if (websitePrice === false) return send(res, 400, { error: 'Website price must be a valid amount.' })
    if (actualPrice === false) return send(res, 400, { error: 'Actual price must be a valid amount.' })
    if (websitePrice === null) {
      try {
        const data = await fetchCatalog()
        const p = data.products.find((x) => String(x.id) === productId)
        if (p) {
          const v = variantId ? (p.options || []).find((o) => String(o.id) === variantId) : null
          const basePrice = money(v?.price ?? p.price)
          websitePrice = basePrice + priceMarkup(basePrice)
        }
      } catch {}
    }
    if (!websitePrice) return send(res, 400, { error: 'Website price is required.' })
    if (actualPrice === null) actualPrice = reverseMarkup(websitePrice)
    const websiteTotal = lineTotal(websitePrice, quantity)
    const actualTotal = lineTotal(actualPrice, quantity)
    if (balanceDue(websiteTotal, amountPaid) > 0 && !customerName) {
      return send(res, 400, { error: 'Add the customer name because this sale has a balance.' })
    }
    const profit = amountPaid - actualTotal
    const result = db.prepare(`
      INSERT INTO sales (sale_date, product_id, product_name, variant_id, variant_label, customer_name, website_price, actual_price, amount_paid, profit, quantity, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      saleDate, productId, String(b.productName).trim(), variantId, b.variantLabel || '', customerName,
      websitePrice, actualPrice, amountPaid, profit, quantity, String(b.note || '').trim(),
    )
    const row = db.prepare('SELECT * FROM sales WHERE id = ?').get(Number(result.lastInsertRowid))
    return send(res, 201, { sale: publicSale(row) })
  }

  if (pathname.startsWith('/api/sales/') && req.method === 'DELETE') {
    const id = Number(pathname.split('/').pop())
    if (!id) return send(res, 400, { error: 'Invalid sale id.' })
    db.prepare('DELETE FROM sales WHERE id = ?').run(id)
    return send(res, 200, { ok: true })
  }

  if (pathname.startsWith('/api/sales/') && req.method === 'PATCH') {
    const id = Number(pathname.split('/').pop())
    const b = await bodyJson(req)
    if (!id) return send(res, 400, { error: 'Invalid sale id.' })
    const websitePrice = readPrice(b.websitePrice)
    const actualPriceInput = readPrice(b.actualPrice)
    const amountPaid = money(b.amountPaid)
    const customerName = String(b.customerName || '').trim()
    const quantity = readQuantity(b.quantity)
    if (websitePrice === false) return send(res, 400, { error: 'Website price must be a valid amount.' })
    if (actualPriceInput === false) return send(res, 400, { error: 'Actual price must be a valid amount.' })
    if (!websitePrice) return send(res, 400, { error: 'Website price is required.' })
    if (!Number.isFinite(Number(b.amountPaid)) || Number(b.amountPaid) < 0) return send(res, 400, { error: 'Amount paid is required.' })
    if (quantity === false) return send(res, 400, { error: 'Quantity must be a whole number of at least 1.' })
    if (balanceDue(lineTotal(websitePrice, quantity), amountPaid) > 0 && !customerName) {
      return send(res, 400, { error: 'Add the customer name because this sale has a balance.' })
    }
    const actualPrice = actualPriceInput === null ? reverseMarkup(websitePrice) : actualPriceInput
    db.prepare(`
      UPDATE sales
      SET customer_name = ?, amount_paid = ?, website_price = ?, actual_price = ?, profit = ?, quantity = ?, note = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(customerName, amountPaid, websitePrice, actualPrice, amountPaid - lineTotal(actualPrice, quantity), quantity, String(b.note || ''), id)
    return send(res, 200, { sale: publicSale(db.prepare('SELECT * FROM sales WHERE id = ?').get(id)) })
  }

  if (pathname === '/api/capital' && req.method === 'POST') {
    const b = await bodyJson(req)
    const contributionDate = String(b.contributionDate || '').slice(0, 10)
    const amount = readPrice(b.amount)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(contributionDate)) return send(res, 400, { error: 'A valid capital date is required.' })
    if (amount === false) return send(res, 400, { error: 'Capital amount must be a valid amount.' })
    if (!amount) return send(res, 400, { error: 'Capital amount is required.' })
    const source = String(b.source || '').trim() || 'Business owner'
    const result = db.prepare(`
      INSERT INTO capital (contribution_date, amount, source, note)
      VALUES (?, ?, ?, ?)
    `).run(contributionDate, amount, source, String(b.note || '').trim())
    const row = db.prepare('SELECT * FROM capital WHERE id = ?').get(Number(result.lastInsertRowid))
    return send(res, 201, { entry: publicCapital(row) })
  }

  if (pathname.startsWith('/api/capital/') && req.method === 'DELETE') {
    const id = Number(pathname.split('/').pop())
    if (!id) return send(res, 400, { error: 'Invalid capital id.' })
    db.prepare('DELETE FROM capital WHERE id = ?').run(id)
    return send(res, 200, { ok: true })
  }

  if (pathname.startsWith('/api/capital/') && req.method === 'PATCH') {
    const id = Number(pathname.split('/').pop())
    const b = await bodyJson(req)
    if (!id) return send(res, 400, { error: 'Invalid capital id.' })
    const contributionDate = String(b.contributionDate || '').slice(0, 10)
    const amount = readPrice(b.amount)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(contributionDate)) return send(res, 400, { error: 'A valid capital date is required.' })
    if (amount === false) return send(res, 400, { error: 'Capital amount must be a valid amount.' })
    if (!amount) return send(res, 400, { error: 'Capital amount is required.' })
    const source = String(b.source || '').trim() || 'Business owner'
    db.prepare(`
      UPDATE capital
      SET contribution_date = ?, amount = ?, source = ?, note = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(contributionDate, amount, source, String(b.note || '').trim(), id)
    return send(res, 200, { entry: publicCapital(db.prepare('SELECT * FROM capital WHERE id = ?').get(id)) })
  }

  return send(res, 404, { error: 'Not found' })
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
}

async function serveStatic(res, pathname) {
  const dist = join(ROOT, 'dist')
  let file = join(dist, pathname === '/' ? 'index.html' : pathname)
  if (!file.startsWith(dist) || !existsSync(file)) file = join(dist, 'index.html')
  if (!existsSync(file)) return send(res, 404, 'Build the frontend first with npm run build')
  const ext = file.slice(file.lastIndexOf('.'))
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  })
  res.end(await readFile(file))
}

createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, `http://${req.headers.host}`).pathname
    if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname)
    return await serveStatic(res, pathname)
  } catch (err) {
    return send(res, 500, { error: String(err?.message || err) })
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Sales book server: http://127.0.0.1:${PORT}`)
  console.log(`Database: ${DB_PATH}`)
})
