import { requireAuth } from '../../shared/auth.js'
import { ensureTable, getSql, normalizeCapital, publicCapital, readBody, send } from '../../shared/db.js'

export default async function handler(req, res) {
  if (!requireAuth(req, res, send)) return
  try {
    await ensureTable()

    if (req.method === 'GET') {
      const rows = await getSql()`SELECT * FROM capital ORDER BY contribution_date DESC, id DESC`
      return send(res, 200, { capital: rows.map(publicCapital) })
    }

    if (req.method === 'POST') {
      const body = await readBody(req)
      const v = normalizeCapital(body)
      const rows = await getSql()`
        INSERT INTO capital (contribution_date, amount, source, note)
        VALUES (${v.contributionDate}, ${v.amount}, ${v.source}, ${v.note})
        RETURNING *
      `
      return send(res, 201, { entry: publicCapital(rows[0]) })
    }

    return send(res, 405, { error: 'Method not allowed' })
  } catch (err) {
    return send(res, err.status || 500, { error: String(err?.message || err) })
  }
}
