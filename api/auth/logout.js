import { clearSessionCookie, readSession } from '../../shared/auth.js'
import { send } from '../../shared/db.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' })
  res.setHeader('set-cookie', clearSessionCookie())
  return send(res, 200, { ok: true, username: readSession(req) })
}
