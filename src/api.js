export async function getJson(url, options) {
  const res = await fetch(url, options)
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`)
  return data
}

export const api = {
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
}
