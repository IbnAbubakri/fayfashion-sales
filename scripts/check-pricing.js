import assert from 'node:assert/strict'
import { balanceDue, paymentStatus, priceMarkup, reverseMarkup } from '../shared/pricing.js'

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

console.log(`Markup, reverse markup, and balances OK for ${markups.length} values`)
