import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

const COOKIE_NAME = 'ffc_session'
const MAX_AGE_SECONDS = 12 * 60 * 60

export function isProduction() {
  return Boolean(process.env.VERCEL || process.env.NODE_ENV === 'production')
}

function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET
  if (isProduction()) throw new Error('SESSION_SECRET is not set')
  return 'local-development-session-secret'
}

export function credentialsConfigured() {
  return Boolean(process.env.ADMIN_USER && process.env.ADMIN_PASSWORD && (process.env.SESSION_SECRET || !isProduction()))
}

function digest(value) {
  return createHash('sha256').update(String(value)).digest()
}

// SHA-256 digests always have the same length, so timingSafeEqual cannot throw
// on a differently sized user input.
function same(a, b) {
  return timingSafeEqual(digest(a), digest(b))
}

export function checkCredentials(username, password) {
  const user = process.env.ADMIN_USER
  const pass = process.env.ADMIN_PASSWORD
  if (!user || !pass) return false
  return same(String(username || '').trim(), user.trim()) && same(String(password || ''), pass)
}

export function createSessionToken(username) {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000
  const payload = `${username}:${expires}`
  const signature = createHmac('sha256', sessionSecret()).update(payload).digest('hex')
  return `${expires}.${signature}`
}

export function readSession(req) {
  const header = req?.headers?.cookie
  if (!header) return null
  const cookie = String(header)
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
  if (!cookie) return null

  const token = cookie.slice(COOKIE_NAME.length + 1)
  const [expiresText, signature] = token.split('.')
  if (!expiresText || !signature) return null
  const expires = Number(expiresText)
  if (!Number.isFinite(expires) || expires <= Date.now()) return null

  const username = (process.env.ADMIN_USER || '').trim()
  const expected = createHmac('sha256', sessionSecret())
    .update(`${username}:${expires}`)
    .digest('hex')
  if (!same(signature, expected)) return null
  return username
}

function cookieAttributes(maxAge) {
  const parts = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`]
  if (isProduction()) parts.push('Secure')
  return parts.join('; ')
}

export function sessionCookie(token) {
  return `${COOKIE_NAME}=${token}; ${cookieAttributes(MAX_AGE_SECONDS)}`
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; ${cookieAttributes(0)}`
}

// Returns true when the request is signed in. Otherwise it writes a 401 and
// returns false, so handlers can simply `if (!requireAuth(...)) return`.
export function requireAuth(req, res, send) {
  if (readSession(req)) return true
  send(res, 401, { error: 'Please sign in to continue.' })
  return false
}
