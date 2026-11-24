import { requireAuth } from '../../shared/auth.js'
import { ensureTable, getSql, normalizeInsert, publicSale, readBody, send } from '../../shared/db.js'
import { fetchCatalog } from '../../shared/catalog.js'

export default async function handler(req, res) {
  if (!requireAuth(req, res, send)) return
  try {
    await ensureTable()

    if (req.method === 'GET') {
      const rows = await getSql()`SELECT * FROM sales ORDER BY sale_date DESC, id DESC`
      return send(res, 200, { sales: rows.map(publicSale) })
    }

    if (req.method === 'POST') {
      const body = await readBody(req)
      let catalogProducts = []
      try { catalogProducts = (await fetchCatalog()).products } catch {}
      const v = normalizeInsert(body, catalogProducts)
      const rows = await getSql()`
        INSERT INTO sales (sale_date, product_id, product_name, variant_id, variant_label, customer_name, website_price, actual_price, amount_paid, profit, note)
        VALUES (${v.saleDate}, ${v.productId}, ${v.productName}, ${v.variantId}, ${v.variantLabel}, ${v.customerName}, ${v.websitePrice}, ${v.actualPrice}, ${v.amountPaid}, ${v.profit}, ${v.note})
        RETURNING *
      `
      return send(res, 201, { sale: publicSale(rows[0]) })
    }

    return send(res, 405, { error: 'Method not allowed' })
  } catch (err) {
    return send(res, err.status || 500, { error: String(err?.message || err) })
  }
}
