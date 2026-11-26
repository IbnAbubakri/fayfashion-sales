import assert from 'node:assert/strict'
import { balanceDue, businessMoney, lineTotal, normalizeQuantity, paymentStatus, priceMarkup, reverseMarkup } from '../shared/pricing.js'
import { normalizeCapital, normalizeInsert, normalizeUpdate } from '../shared/db.js'

const markups = [
  [0, 300], [999, 300],
  [1000, 700], [2999, 700],
  [3000, 1000], [4999, 1000],
  [5000, 1500], [9999, 1500],
  [10000, 2000], [19999, 2000],
  [20000, 3000], [49999, 3000],
  [50000, 5000], [150000, 5000],
]

for (const [base, expected] of markups) {
  assert.equal(priceMarkup(base), expected, `markup failed for base ${base}`)
}

for (const [base] of markups) {
  const display = base + priceMarkup(base)
  assert.equal(reverseMarkup(display), base, `reverse failed for base ${base} -> display ${display}`)
}

for (const [website, paid, expected] of [
  [6500, 7500, 0],
  [6500, 6500, 0],
  [6500, 4000, 2500],
  [6500, 0, 6500],
]) {
  assert.equal(balanceDue(website, paid), expected, `balance failed for ${website}/${paid}`)
}

assert.equal(paymentStatus(6500, 7500), 'paid')
assert.equal(paymentStatus(6500, 6500), 'paid')
assert.equal(paymentStatus(6500, 4000), 'partial')
assert.equal(paymentStatus(6500, 0), 'unpaid')

const discounted = normalizeInsert({
  saleDate: '2026-11-26', productId: 'p1', productName: 'Test product',
  websitePrice: 5000, actualPrice: 4300, amountPaid: 5000, customerName: '',
})
assert.equal(discounted.websitePrice, 5000, 'website price override was ignored')
assert.equal(discounted.actualPrice, 4300, 'actual price override was ignored')
assert.equal(discounted.profit, 700, 'profit should use the edited actual price')
assert.equal(discounted.due, 0, 'balance should use the edited website price')

const partial = normalizeUpdate({
  websitePrice: 5000, actualPrice: 4300, amountPaid: 2500, customerName: 'Ada',
})
assert.equal(partial.actualPrice, 4300, 'edit actual price override was ignored')
assert.equal(partial.due, 2500, 'edit balance should use the edited website price')
assert.equal(partial.profit, -1800, 'edit profit should use the edited actual price')

const fallback = normalizeInsert({
  saleDate: '2026-11-26', productId: 'p1', productName: 'Test product',
  websitePrice: 6500, amountPaid: 6500,
})
assert.equal(fallback.actualPrice, 5000, 'missing actual price should still reverse markup')

assert.equal(normalizeQuantity(undefined), 1, 'missing quantity should default to one')
assert.equal(normalizeQuantity(2.8), 2, 'quantity should be a whole number')
assert.equal(lineTotal(6500, 2), 13000, 'line total should multiply by quantity')

const multiple = normalizeInsert({
  saleDate: '2026-11-26', productId: 'p1', productName: 'Test product',
  websitePrice: 6500, actualPrice: 5000, quantity: 2, amountPaid: 13000,
})
assert.equal(multiple.quantity, 2, 'quantity was ignored')
assert.equal(multiple.websiteTotal, 13000, 'website total should use quantity')
assert.equal(multiple.profit, 3000, 'profit should use total actual cost')
assert.equal(multiple.due, 0, 'balance should use total website price')

const partialMultiple = normalizeUpdate({
  websitePrice: 6500, actualPrice: 5000, quantity: 2, amountPaid: 10000, customerName: 'Ada',
})
assert.equal(partialMultiple.due, 3000, 'partial balance should use total price')
assert.equal(partialMultiple.profit, 0, 'profit should use total cost')

assert.throws(() => normalizeInsert({
  saleDate: '2026-11-26', productId: 'p1', productName: 'Test product',
  websitePrice: 6500, amountPaid: 6500, quantity: 0,
}), /Quantity/, 'zero quantity should be rejected')

const capital = normalizeCapital({
  contributionDate: '2026-11-26', amount: 10000, source: 'Dad', note: 'Week 1 of 10',
})
assert.equal(capital.amount, 10000, 'capital amount was not stored')
assert.equal(capital.source, 'Dad', 'capital source was not stored')

for (const [amount, profit, expected] of [
  [10000, 700, 10700],
  [100000, -500, 99500],
  [0, 2500, 2500],
  [10000, -10000, 0],
]) {
  assert.equal(businessMoney(amount, profit), expected, `business money failed for ${amount}/${profit}`)
}

console.log(`Markup, balances, price overrides, quantities, and capital totals OK for ${markups.length} values`)
