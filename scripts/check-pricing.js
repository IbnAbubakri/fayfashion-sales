import assert from 'node:assert/strict'
import { priceMarkup, reverseMarkup } from '../shared/pricing.js'

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

console.log(`Markup and reverse markup OK for ${markups.length} values`)
