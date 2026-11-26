// FayFashionCart's markup ladder, copied from the storefront.
// The site stores supplier prices in products.json and adds these amounts in
// src/lib/catalog.js before display. This record book reverses the same ladder
// so the "actual price" shown here is the supplier price before markup.
export function priceMarkup(basePrice) {
  const base = Number(basePrice) || 0
  if (base < 1000) return 300
  if (base < 3000) return 700
  if (base < 5000) return 1000
  if (base < 10000) return 1500
  if (base < 20000) return 2000
  if (base < 50000) return 3000
  return 5000
}

export function reverseMarkup(displayPrice) {
  const display = Math.max(0, Math.round(Number(displayPrice) || 0))
  // Display ranges produced by the ladder above:
  // [300,1300) -> +300; [1700,3700) -> +700; [4000,6000) -> +1000;
  // [6500,11500) -> +1500; [12000,22000) -> +2000; [23000,53000) -> +3000;
  // [55000,∞) -> +5000. The gaps are not produced by a real base price.
  if (display <= 300) return 0
  if (display < 1300) return display - 300
  if (display < 3700) return display - 700
  if (display < 6000) return display - 1000
  if (display < 11500) return display - 1500
  if (display < 22000) return display - 2000
  if (display < 53000) return display - 3000
  return display - 5000
}

// Missing or invalid quantities default to one item. Stored prices are per item.
export function normalizeQuantity(value) {
  const n = Math.floor(Number(value))
  return Number.isFinite(n) && n > 0 ? n : 1
}

export function lineTotal(unitPrice, quantity) {
  return Math.round((Number(unitPrice) || 0) * normalizeQuantity(quantity))
}

export function balanceDue(websitePrice, amountPaid) {
  const due = Math.round(Number(websitePrice) || 0) - Math.round(Number(amountPaid) || 0)
  return Math.max(0, due)
}

export function paymentStatus(websitePrice, amountPaid) {
  const paid = Math.round(Number(amountPaid) || 0)
  if (paid <= 0) return 'unpaid'
  return balanceDue(websitePrice, paid) > 0 ? 'partial' : 'paid'
}

export function paymentLabel(status) {
  return { paid: 'Paid', partial: 'Partial', unpaid: 'Unpaid' }[status] || 'Paid'
}

// Total business money = capital put in + profit made from sales.
export function businessMoney(capital, profit) {
  return Math.round((Number(capital) || 0) + (Number(profit) || 0))
}

export function formatNaira(value) {
  return `₦${Math.round(Number(value) || 0).toLocaleString('en-NG')}`
}
