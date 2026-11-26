import { requireAuth } from '../../shared/auth.js'
import { ensureTable, getSql, send } from '../../shared/db.js'
import { balanceDue, lineTotal, paymentLabel, paymentStatus } from '../../shared/pricing.js'

export default async function handler(req, res) {
  if (!requireAuth(req, res, send)) return
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' })
  try {
    await ensureTable()
    const rows = await getSql()`
      SELECT sale_date, customer_name, product_name, variant_label, quantity,
             website_price, amount_paid, profit, note
      FROM sales ORDER BY sale_date DESC, id DESC
    `
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
    res.setHeader('content-disposition', 'attachment; filename="fayfashion-sales.csv"')
    return send(res, 200, csv)
  } catch (err) {
    return send(res, 500, { error: String(err?.message || err) })
  }
}
