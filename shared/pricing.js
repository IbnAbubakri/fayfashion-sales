// FayFashionCart's markup ladder, copied from the storefront.
// The site stores supplier prices in products.json and adds these amounts in
// src/lib/catalog.js before display. This record book reverses the same ladder
// so the "actual price" shown here is the supplier price before markup.
export function priceMarkup(basePrice) {
  const base = Number(basePrice) || 0
  if (base < 1000) return 500
  if (base < 3000) return 1000
  if (base < 5000) return 1500
  if (base < 10000) return 2000
  if (base < 20000) return 3000
  if (base < 50000) return 4000
  return 5000
}

export function reverseMarkup(displayPrice) {
  const display = Math.max(0, Math.round(Number(displayPrice) || 0))
  // Show web -> base ranges: [500,1500] -> +500; [2000,4000] -> +1000; etc.
  if (display <= 1500) return Math.max(0, display - 500)
  if (display <= 4000) return display - 1000
  if (display <= 6500) return display - 1500
  if (display <= 12000) return display - 2000
  if (display <= 23000) return display - 3000
  if (display <= 54000) return display - 4000
  return display - 5000
}

export function formatNaira(value) {
  return `₦${Math.round(Number(value) || 0).toLocaleString('en-NG')}`
}
