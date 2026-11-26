export async function getJson(url, options) {
  const res = await fetch(url, options)
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`)
  return data
}

export const api = {
  session: () => getJson('/api/auth/session'),
  login: (credentials) => getJson('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(credentials),
  }),
  logout: () => getJson('/api/auth/logout', { method: 'POST' }),
  products: () => getJson('/api/products'),
  sales: () => getJson('/api/sales'),
  addSale: (payload) => getJson('/api/sales', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }),
  updateSale: (id, payload) => getJson(`/api/sales/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }),
  deleteSale: (id) => getJson(`/api/sales/${id}`, { method: 'DELETE' }),
  capital: () => getJson('/api/capital'),
  addCapital: (payload) => getJson('/api/capital', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }),
  updateCapital: (id, payload) => getJson(`/api/capital/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }),
  deleteCapital: (id) => getJson(`/api/capital/${id}`, { method: 'DELETE' }),
}
