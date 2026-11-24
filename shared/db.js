import { neon } from '@neondatabase/serverless'
import { reverseMarkup } from './pricing.js'

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
    tablePromise = getSql()`
      CREATE TABLE IF NOT EXISTS sales (
        id SERIAL PRIMARY KEY,
        sale_date DATE NOT NULL,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        variant_id TEXT,
        variant_label TEXT,
        website_price NUMERIC NOT NULL,
        actual_price NUMERIC NOT NULL,
        amount_paid NUMERIC NOT NULL,
        profit NUMERIC NOT NULL,
        note TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `.catch((err) => {
      tablePromise = null
      throw err
    })
  }
  return tablePromise
}

export function publicSale(row) {
  return {
    id: Number(row.id),
    sale_date: row.sale_date,
    product_id: row.product_id,
    product_name: row.product_name,
    variant_id: row.variant_id,
    variant_label: row.variant_label,
    website_price: Number(row.website_price),
    actual_price: Number(row.actual_price),
    amount_paid: Number(row.amount_paid),
    profit: Number(row.profit),
    note: row.note,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export function normalizeInsert(b, catalogProducts = []) {
  const saleDate = String(b.saleDate || '').slice(0, 10)
  const productId = String(b.productId || '')
  const productName = String(b.productName || '').trim()
  const variantId = b.variantId ? String(b.variantId) : null
  const amountPaid = Math.round(Number(b.amountPaid) || 0)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) throw Object.assign(new Error('A valid sale date is required.'), { status: 400 })
  if (!productId || !productName) throw Object.assign(new Error('Choose a product.'), { status: 400 })
  if (!Number.isFinite(Number(b.amountPaid))) throw Object.assign(new Error('Amount paid is required.'), { status: 400 })

  let websitePrice = Math.round(Number(b.websitePrice) || 0)
  if (!websitePrice) {
    const p = catalogProducts.find((x) => String(x.id) === productId)
    const v = variantId ? (p?.options || []).find((o) => String(o.id) === variantId) : null
    websitePrice = Math.round(Number(v?.price ?? p?.price) || 0)
  }
  const actualPrice = reverseMarkup(websitePrice)
  return {
    saleDate, productId, productName, variantId,
    variantLabel: b.variantLabel || '',
    websitePrice, actualPrice, amountPaid,
    profit: amountPaid - actualPrice,
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
