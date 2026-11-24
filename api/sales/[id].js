import { requireAuth } from '../../shared/auth.js'
import { ensureTable, getSql, normalizeUpdate, publicSale, readBody, send } from '../../shared/db.js'

function idFrom(req) {
  return Number(req.query?.id || req.url?.split('?')[0]?.split('/').pop())
}

export default async function handler(req, res) {
  if (!requireAuth(req, res, send)) return
  try {
    const id = idFrom(req)
    if (!id) return send(res, 400, { error: 'Invalid sale id.' })
    await ensureTable()

    if (req.method === 'DELETE') {
      await getSql()`DELETE FROM sales WHERE id = ${id}`
      return send(res, 200, { ok: true })
    }

    if (req.method === 'PATCH') {
      const b = await readBody(req)
      const v = normalizeUpdate(b)
      const rows = await getSql()`
        UPDATE sales
        SET customer_name = ${v.customerName}, amount_paid = ${v.amountPaid}, website_price = ${v.websitePrice},
            actual_price = ${v.actualPrice}, profit = ${v.profit}, note = ${v.note}, updated_at = now()
        WHERE id = ${id}
        RETURNING *
      `
      if (!rows.length) return send(res, 404, { error: 'Sale not found.' })
      return send(res, 200, { sale: publicSale(rows[0]) })
    }

    return send(res, 405, { error: 'Method not allowed' })
  } catch (err) {
    return send(res, 500, { error: String(err?.message || err) })
  }
}
