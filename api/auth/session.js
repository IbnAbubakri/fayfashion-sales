import { readSession } from '../../shared/auth.js'
import { send } from '../../shared/db.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' })
  const username = readSession(req)
  return send(res, 200, { authenticated: Boolean(username), username: username || null })
}
