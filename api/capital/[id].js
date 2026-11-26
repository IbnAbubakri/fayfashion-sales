import { requireAuth } from '../../shared/auth.js'
import { ensureTable, getSql, normalizeCapital, publicCapital, readBody, send } from '../../shared/db.js'

function idFrom(req) {
  return Number(req.query?.id || req.url?.split('?')[0]?.split('/').pop())
}

export default async function handler(req, res) {
  if (!requireAuth(req, res, send)) return
  try {
    const id = idFrom(req)
    if (!id) return send(res, 400, { error: 'Invalid capital id.' })
    await ensureTable()

    if (req.method === 'DELETE') {
      await getSql()`DELETE FROM capital WHERE id = ${id}`
      return send(res, 200, { ok: true })
    }

    if (req.method === 'PATCH') {
      const v = normalizeCapital(await readBody(req))
      const rows = await getSql()`
        UPDATE capital
        SET contribution_date = ${v.contributionDate}, amount = ${v.amount}, source = ${v.source},
            note = ${v.note}, updated_at = now()
        WHERE id = ${id}
        RETURNING *
      `
      if (!rows.length) return send(res, 404, { error: 'Capital entry not found.' })
      return send(res, 200, { entry: publicCapital(rows[0]) })
    }

    return send(res, 405, { error: 'Method not allowed' })
  } catch (err) {
    return send(res, err.status || 500, { error: String(err?.message || err) })
  }
}
