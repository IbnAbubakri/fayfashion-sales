import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { priceMarkup, reverseMarkup } from '../shared/pricing.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DB_DIR = join(ROOT, 'data')
const DB_PATH = process.env.SALES_DB_PATH || join(DB_DIR, 'sales.db')
const PORT = Number(process.env.PORT || 4174)
const CATALOG_URLS = [
  'http://fayfashioncart.com.ng/products.json',
  'https://fayfashioncart.vercel.app/products.json',
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
    website_price REAL NOT NULL,
    actual_price REAL NOT NULL,
    amount_paid REAL NOT NULL,
    profit REAL NOT NULL,
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
  CREATE INDEX IF NOT EXISTS idx_sales_product ON sales(product_name);
`)

let catalogCache = { data: null, fetchedAt: 0 }

async function fetchCatalog() {
  if (catalogCache.data && Date.now() - catalogCache.fetchedAt < 5 * 60 * 1000) return catalogCache.data
  let lastError
  for (const url of CATALOG_URLS) {
    try {
      const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } })
      if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
      const data = await res.json()
      if (!Array.isArray(data.products)) throw new Error(`${url} has no products array`)
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
    const websitePrice = Number(o.price) > 0 ? Number(o.price) : Number(product.price) || 0
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
  const websitePrice = Number(product.price) || 0
  return {
    id: String(product.id),
    name: String(product.name || ''),
    source: product.source || '',
    category: product.category || '',
    image: product.image || product.thumbnail || null,
    websitePrice,
    actualPrice: reverseMarkup(websitePrice),
    priceText: product.price_display || product.price_formatted || '',
    hasOptions: options.length > 0,
    options,
  }
}

function money(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n) : 0
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
    const rows = db.prepare('SELECT sale_date, product_name, variant_label, website_price, actual_price, amount_paid, profit, note FROM sales ORDER BY sale_date DESC, id DESC').all()
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [
      'Date,Product,Variant,Website Price,Actual Price,Amount Paid,Profit,Note',
      ...rows.map((r) => [
        r.sale_date, r.product_name, r.variant_label, r.website_price,
        r.actual_price, r.amount_paid, r.profit, r.note,
      ].map(esc).join(',')),
    ].join('\n')
    return csv
  },
}

async function handleApi(req, res, pathname) {
  const route = routes[pathname]
  if (route) return send(res, 200, await route())

  if (pathname === '/api/sales' && req.method === 'GET') {
    const rows = db.prepare('SELECT * FROM sales ORDER BY sale_date DESC, id DESC').all()
    return send(res, 200, { sales: rows })
  }

  if (pathname === '/api/sales' && req.method === 'POST') {
    const b = await bodyJson(req)
    const productId = String(b.productId || '')
    const variantId = b.variantId ? String(b.variantId) : null
    const saleDate = String(b.saleDate || '').slice(0, 10)
    const amountPaid = money(b.amountPaid)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) return send(res, 400, { error: 'A valid sale date is required.' })
    if (!productId || !String(b.productName || '').trim()) return send(res, 400, { error: 'Choose a product.' })
    if (!Number.isFinite(Number(b.amountPaid))) return send(res, 400, { error: 'Amount paid is required.' })

    let websitePrice = money(b.websitePrice)
    if (!websitePrice) {
      try {
        const data = await fetchCatalog()
        const p = data.products.find((x) => String(x.id) === productId)
        if (p) {
          const v = variantId ? (p.options || []).find((o) => String(o.id) === variantId) : null
          websitePrice = money(v?.price ?? p.price)
        }
      } catch {}
    }
    const actualPrice = reverseMarkup(websitePrice)
    const profit = amountPaid - actualPrice
    const result = db.prepare(`
      INSERT INTO sales (sale_date, product_id, product_name, variant_id, variant_label, website_price, actual_price, amount_paid, profit, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      saleDate, productId, String(b.productName).trim(), variantId, b.variantLabel || '',
      websitePrice, actualPrice, amountPaid, profit, String(b.note || '').trim(),
    )
    const row = db.prepare('SELECT * FROM sales WHERE id = ?').get(Number(result.lastInsertRowid))
    return send(res, 201, { sale: row })
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
    const amountPaid = money(b.amountPaid)
    const actualPrice = reverseMarkup(money(b.websitePrice))
    db.prepare(`
      UPDATE sales
      SET amount_paid = ?, website_price = ?, actual_price = ?, profit = ?, note = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(amountPaid, money(b.websitePrice), actualPrice, amountPaid - actualPrice, String(b.note || ''), id)
    return send(res, 200, { sale: db.prepare('SELECT * FROM sales WHERE id = ?').get(id) })
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
