import { checkCredentials, clearSessionCookie, createSessionToken, credentialsConfigured, sessionCookie } from '../../shared/auth.js'
import { readBody, send } from '../../shared/db.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' })
  try {
    if (!credentialsConfigured()) {
      return send(res, 500, { error: 'Login is not configured on this deployment.' })
    }
    const body = await readBody(req)
    const username = String(body.username || '').trim()
    if (!checkCredentials(username, body.password)) {
      return send(res, 401, { error: 'Incorrect username or password.' })
    }
    res.setHeader('set-cookie', sessionCookie(createSessionToken(username)))
    return send(res, 200, { ok: true, username })
  } catch (err) {
    res.setHeader('set-cookie', clearSessionCookie())
    return send(res, 500, { error: String(err?.message || err) })
  }
}
