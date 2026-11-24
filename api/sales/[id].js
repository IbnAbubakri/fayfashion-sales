import { ensureTable, getSql, publicSale, readBody, send } from '../../shared/db.js'
import { reverseMarkup } from '../../shared/pricing.js'

function idFrom(req) {
  return Number(req.query?.id || req.url?.split('?')[0]?.split('/').pop())
}

export default async function handler(req, res) {
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
      const websitePrice = Math.round(Number(b.websitePrice) || 0)
      const amountPaid = Math.round(Number(b.amountPaid) || 0)
      const actualPrice = reverseMarkup(websitePrice)
      const rows = await getSql()`
        UPDATE sales
        SET amount_paid = ${amountPaid}, website_price = ${websitePrice}, actual_price = ${actualPrice},
            profit = ${amountPaid - actualPrice}, note = ${String(b.note || '')}, updated_at = now()
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
