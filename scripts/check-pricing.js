import assert from 'node:assert/strict'
import { priceMarkup, reverseMarkup } from '../shared/pricing.js'

const cases = [0, 700, 999, 1000, 2999, 3000, 4999, 5000, 9999, 10000, 19999, 20000, 49999, 50000, 150000]
for (const base of cases) {
  const display = base + priceMarkup(base)
  assert.equal(reverseMarkup(display), base, `reverse failed for base ${base} -> display ${display}`)
}
console.log(`Reverse markup OK for ${cases.length} values`)
