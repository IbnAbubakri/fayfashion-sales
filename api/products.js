import { requireAuth } from '../shared/auth.js'
import { publicCatalog, fetchCatalog } from '../shared/catalog.js'
import { send } from '../shared/db.js'

export default async function handler(req, res) {
  if (!requireAuth(req, res, send)) return
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' })
  try {
    const data = await fetchCatalog()
    return send(res, 200, publicCatalog(data))
  } catch (err) {
    return send(res, 500, { error: String(err?.message || err) })
  }
}
