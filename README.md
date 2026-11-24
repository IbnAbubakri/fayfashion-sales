# FayFashionCart Sales Book

A local sales/profit record book for FayFashionCart. It reads the current live catalogue from `http://fayfashioncart.com.ng/products.json`, lets you search the exact product/variant, and reverses FayFashionCart's tiered markup to compute the supplier/actual price.

## Features

- Searchable product dropdown from the live FayFashionCart catalogue
- Variant-aware pricing when a product has size/colour options
- Website price, actual/source price, amount paid, and auto profit in a table
- Sales stored in Neon Postgres through Vercel serverless APIs (cloud persistence)
- Local development can still use SQLite via `npm run dev`
- Edit/delete records, filter by date/product, export CSV

## Vercel environment

Set `DATABASE_URL` to the Neon Postgres connection string. The first API request creates the `sales` table automatically.

## Pricing rule

The storefront stores supplier prices and adds a markup before display:

| Supplier/base price | Markup |
|---:|---:|
| < ₦1,000 | ₦300 |
| < ₦3,000 | ₦700 |
| < ₦5,000 | ₦1,000 |
| < ₦10,000 | ₦1,500 |
| < ₦20,000 | ₦2,000 |
| < ₦50,000 | ₦3,000 |
| ≥ ₦50,000 | ₦5,000 |

The record book reverses that markup from the displayed website price.

## Run locally

```bash
npm install
npm run dev
```

Frontend: <http://localhost:5174>
API server: <http://127.0.0.1:4174>

For a single production-style server:

```bash
npm run build
npm start
```

Then open <http://127.0.0.1:4174>.

## Backup

Copy `data/sales.db` to back up all records. You can also export CSV from the page.
