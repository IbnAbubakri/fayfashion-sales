# FayFashionCart Sales Book

A local sales/profit record book for FayFashionCart. It reads the current live catalogue from `http://fayfashioncart.com.ng/products.json`, lets you search the exact product/variant, and auto-fills website and supplier prices. Both prices can be edited for customer discounts.

## Features

- Searchable product dropdown from the live FayFashionCart catalogue
- Variant-aware pricing when a product has size/colour options
- Editable website price and actual/source price for discounted customer sales
- Website price, actual/source price, amount paid, balance due, and auto profit in a table
- Customer name is saved whenever a sale is unpaid or partially paid
- Outstanding balance total, payment status badges, and payment-status filters
- Sales stored in Neon Postgres through Vercel serverless APIs (cloud persistence)
- Local development can still use SQLite via `npm run dev`
- Edit/delete records, filter by date/product, export CSV
- Password-protected dashboard with a signed, httpOnly session cookie
- Capital card for each contribution received (₦100,000 goal tracker) and total business money

## Vercel environment

Set `DATABASE_URL` to the Neon Postgres connection string. The first API request creates the `sales` and `capital` tables automatically.

The dashboard and every API route require sign-in. Set these environment variables in Vercel:

| Variable | Purpose |
|---|---|
| `ADMIN_USER` | Login username |
| `ADMIN_PASSWORD` | Login password |
| `SESSION_SECRET` | Long random string used to sign session cookies |

Sessions last 12 hours and are stored in an `HttpOnly`, `SameSite=Lax`, `Secure` cookie. Signing out clears the cookie.

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

The record book uses that ladder to auto-fill the prices. You can override both the website price and actual/source price when a customer gets a discount; profit is always `amount paid − actual price`.

## Balance rule

`Balance due = max(0, website price − amount paid)`. A customer name is required when the balance is greater than zero, and the name and balance are included in CSV exports.

## Capital rule

Each amount received is added as its own dated capital entry (with source and optional note), so the ₦10,000 weekly contributions toward the ₦100,000 goal can be tracked independently. Entries can be edited or deleted.

`Business money = total capital + all-time profit`. Profit is still calculated only from sales (`amount paid − actual price`); capital is stored separately and never counted as sales profit.

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

Copy `data/sales.db` to back up all sale and capital records. You can also export CSV from the page.
