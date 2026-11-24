import { reverseMarkup } from './pricing.js'

const CATALOG_SOURCES = [
  { url: 'http://fayfashioncart.com.ng/products.json', timeoutMs: 8000 },
  { url: 'https://fayfashioncart.vercel.app/products.json', timeoutMs: 45000 },
]

let cache = { data: null, fetchedAt: 0 }

export async function fetchCatalog() {
  if (cache.data && Date.now() - cache.fetchedAt < 5 * 60 * 1000) return cache.data
  let lastError
  for (const source of CATALOG_SOURCES) {
    try {
      const res = await fetch(source.url, {
        headers: { 'cache-control': 'no-cache' },
        signal: AbortSignal.timeout(source.timeoutMs),
      })
      if (!res.ok) throw new Error(`${source.url} -> HTTP ${res.status}`)
      const data = await res.json()
      if (!Array.isArray(data.products)) throw new Error(`${source.url} has no products array`)
      cache = { data, fetchedAt: Date.now() }
      return data
    } catch (err) {
      lastError = err
    }
  }
  if (cache.data) return cache.data
  throw lastError || new Error('Could not load catalogue')
}

function catalogOptions(product) {
  const options = Array.isArray(product.options) ? product.options : []
  return options.map((o) => {
    const websitePrice = Number(o.price) > 0 ? Number(o.price) : Number(product.price) || 0
    return {
      id: String(o.id),
      label: String(o.label),
      websitePrice,
      actualPrice: reverseMarkup(websitePrice),
      inStock: o.in_stock,
    }
  })
}

export function publicProduct(product) {
  const options = catalogOptions(product)
  const websitePrice = Number(product.price) || 0
  return {
    id: String(product.id),
    name: String(product.name || ''),
    source: product.source || '',
    category: product.category || '',
    image: product.image || product.thumbnail || null,
    websitePrice,
    actualPrice: reverseMarkup(websitePrice),
    priceText: product.price_display || product.price_formatted || '',
    hasOptions: options.length > 0,
    options,
  }
}

export function publicCatalog(data) {
  return {
    syncedAt: data.synced_at || null,
    total: data.total || data.products.length,
    products: data.products.map(publicProduct),
  }
}
