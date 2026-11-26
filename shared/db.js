import { neon } from '@neondatabase/serverless'
import { balanceDue, lineTotal, normalizeQuantity, paymentStatus, priceMarkup, reverseMarkup } from './pricing.js'

let client = null
let tablePromise = null

export function getSql() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  if (!client) client = neon(url)
  return client
}

export async function ensureTable() {
  if (!tablePromise) {
    tablePromise = (async () => {
      await getSql()`
        CREATE TABLE IF NOT EXISTS sales (
          id SERIAL PRIMARY KEY,
          sale_date DATE NOT NULL,
          product_id TEXT NOT NULL,
          product_name TEXT NOT NULL,
          variant_id TEXT,
          variant_label TEXT,
          customer_name TEXT DEFAULT '',
          website_price NUMERIC NOT NULL,
          actual_price NUMERIC NOT NULL,
          amount_paid NUMERIC NOT NULL,
          profit NUMERIC NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 1,
          note TEXT DEFAULT '',
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now()
        )
      `
      await getSql()`ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_name TEXT DEFAULT ''`
      await getSql()`ALTER TABLE sales ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1`
      await getSql()`
        CREATE TABLE IF NOT EXISTS capital (
          id SERIAL PRIMARY KEY,
          contribution_date DATE NOT NULL,
          amount NUMERIC NOT NULL,
          source TEXT DEFAULT '',
          note TEXT DEFAULT '',
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now()
        )
      `
    })().catch((err) => {
      tablePromise = null
      throw err
    })
  }
  return tablePromise
}

function dateOnly(value) {
  if (!value) return value
  const text = value instanceof Date ? value.toISOString() : String(value)
  return text.slice(0, 10)
}

export function publicSale(row) {
  const websitePrice = Number(row.website_price) || 0
  const quantity = normalizeQuantity(row.quantity)
  const websiteTotal = lineTotal(websitePrice, quantity)
  const amountPaid = Number(row.amount_paid) || 0
  return {
    id: Number(row.id),
    sale_date: dateOnly(row.sale_date),
    product_id: row.product_id,
    product_name: row.product_name,
    variant_id: row.variant_id,
    variant_label: row.variant_label,
    customer_name: row.customer_name || '',
    quantity,
    website_price: websitePrice,
    actual_price: Number(row.actual_price),
    website_total: websiteTotal,
    actual_total: lineTotal(row.actual_price, quantity),
    amount_paid: amountPaid,
    balance_due: balanceDue(websiteTotal, amountPaid),
    payment_status: paymentStatus(websiteTotal, amountPaid),
    profit: Number(row.profit),
    note: row.note,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export function publicCapital(row) {
  return {
    id: Number(row.id),
    contribution_date: dateOnly(row.contribution_date),
    amount: Number(row.amount),
    source: row.source || '',
    note: row.note || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 })
}

function readAmount(value, label) {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) throw badRequest(`${label} must be a valid amount.`)
  return Math.round(n)
}

function readQuantity(value) {
  if (value === undefined || value === null || value === '') return 1
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1) throw badRequest('Quantity must be a whole number of at least 1.')
  return n
}

export function normalizeInsert(b, catalogProducts = []) {
  const saleDate = String(b.saleDate || '').slice(0, 10)
  const productId = String(b.productId || '')
  const productName = String(b.productName || '').trim()
  const variantId = b.variantId ? String(b.variantId) : null
  const customerName = String(b.customerName || '').trim()
  const amountPaid = Math.round(Number(b.amountPaid) || 0)
  const quantity = readQuantity(b.quantity)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) throw badRequest('A valid sale date is required.')
  if (!productId || !productName) throw badRequest('Choose a product.')
  if (!Number.isFinite(Number(b.amountPaid)) || Number(b.amountPaid) < 0) throw badRequest('Amount paid is required.')

  let websitePrice = readAmount(b.websitePrice, 'Website price')
  let actualPrice = readAmount(b.actualPrice, 'Actual price')
  if (websitePrice === null) {
    const p = catalogProducts.find((x) => String(x.id) === productId)
    const v = variantId ? (p?.options || []).find((o) => String(o.id) === variantId) : null
    const basePrice = Math.round(Number(v?.price ?? p?.price) || 0)
    websitePrice = basePrice + priceMarkup(basePrice)
  }
  if (!websitePrice) throw badRequest('Website price is required.')
  if (actualPrice === null) actualPrice = reverseMarkup(websitePrice)
  const websiteTotal = lineTotal(websitePrice, quantity)
  const actualTotal = lineTotal(actualPrice, quantity)
  const due = balanceDue(websiteTotal, amountPaid)
  if (due > 0 && !customerName) throw badRequest('Add the customer name because this sale has a balance.')
  return {
    saleDate, productId, productName, variantId,
    variantLabel: b.variantLabel || '', customerName, quantity,
    websitePrice, actualPrice, websiteTotal, actualTotal, amountPaid, due,
    profit: amountPaid - actualTotal,
    note: String(b.note || '').trim(),
  }
}

export function normalizeUpdate(b) {
  const websitePrice = readAmount(b.websitePrice, 'Website price')
  const actualPriceInput = readAmount(b.actualPrice, 'Actual price')
  const amountPaid = Math.round(Number(b.amountPaid) || 0)
  const customerName = String(b.customerName || '').trim()
  const quantity = readQuantity(b.quantity)
  if (!websitePrice) throw badRequest('Website price is required.')
  if (!Number.isFinite(Number(b.amountPaid)) || Number(b.amountPaid) < 0) throw badRequest('Amount paid is required.')
  const actualPrice = actualPriceInput === null ? reverseMarkup(websitePrice) : actualPriceInput
  const websiteTotal = lineTotal(websitePrice, quantity)
  const actualTotal = lineTotal(actualPrice, quantity)
  const due = balanceDue(websiteTotal, amountPaid)
  if (due > 0 && !customerName) throw badRequest('Add the customer name because this sale has a balance.')
  return {
    websitePrice, actualPrice, quantity, websiteTotal, actualTotal,
    amountPaid, customerName, due,
    profit: amountPaid - actualTotal,
    note: String(b.note || '').trim(),
  }
}

export function normalizeCapital(b) {
  const contributionDate = String(b.contributionDate || '').slice(0, 10)
  const amount = readAmount(b.amount, 'Capital amount')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(contributionDate)) throw badRequest('A valid capital date is required.')
  if (!amount) throw badRequest('Capital amount is required.')
  return {
    contributionDate,
    amount,
    source: String(b.source || '').trim() || 'Business owner',
    note: String(b.note || '').trim(),
  }
}

export function send(res, status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  res.status(status)
  res.setHeader('content-type', typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.send(text)
}

export async function readBody(req) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  return raw ? JSON.parse(raw) : {}
}
