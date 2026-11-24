import { requireAuth } from '../../shared/auth.js'
import { ensureTable, getSql, send } from '../../shared/db.js'

export default async function handler(req, res) {
  if (!requireAuth(req, res, send)) return
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' })
  try {
    await ensureTable()
    const rows = await getSql()`
      SELECT sale_date, product_name, variant_label, website_price, actual_price, amount_paid, profit, note
      FROM sales ORDER BY sale_date DESC, id DESC
    `
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [
      'Date,Product,Variant,Website Price,Actual Price,Amount Paid,Profit,Note',
      ...rows.map((r) => [
        r.sale_date, r.product_name, r.variant_label, r.website_price,
        r.actual_price, r.amount_paid, r.profit, r.note,
      ].map(esc).join(',')),
    ].join('\n')
    res.setHeader('content-disposition', 'attachment; filename="fayfashion-sales.csv"')
    return send(res, 200, csv)
  } catch (err) {
    return send(res, 500, { error: String(err?.message || err) })
  }
}
