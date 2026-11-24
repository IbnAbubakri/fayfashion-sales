import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'
import { formatNaira } from '../shared/pricing'

const today = new Date().toISOString().slice(0, 10)

function summary(sales) {
  const totalPaid = sales.reduce((sum, s) => sum + Number(s.amount_paid || 0), 0)
  const totalActual = sales.reduce((sum, s) => sum + Number(s.actual_price || 0), 0)
  const totalProfit = sales.reduce((sum, s) => sum + Number(s.profit || 0), 0)
  return { count: sales.length, totalPaid, totalActual, totalProfit }
}

function ProductPicker({ products, selected, onSelect }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => {
    const close = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const list = needle
      ? products.filter((p) => p.name.toLowerCase().includes(needle) || p.category.toLowerCase().includes(needle))
      : products
    return list.slice(0, 60)
  }, [products, query])

  return (
    <div className="picker" ref={boxRef}>
      <input
        value={open ? query : selected?.name || ''}
        placeholder={products.length ? 'Search product name…' : 'Loading catalogue…'}
        onFocus={() => { setOpen(true); setQuery('') }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        aria-label="Search product"
        autoComplete="off"
      />
      {open && (
        <div className="picker-menu" role="listbox">
          {matches.length === 0 && <div className="picker-empty">No product found</div>}
          {matches.map((p) => (
            <button
              type="button"
              className="picker-item"
              key={`${p.source}-${p.id}`}
              onClick={() => { onSelect(p); setOpen(false); setQuery('') }}
            >
              <span className="picker-name">{p.name}</span>
              <span className="picker-meta">{p.category || p.source} · {p.priceText || formatNaira(p.websitePrice)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [products, setProducts] = useState([])
  const [catalogMeta, setCatalogMeta] = useState(null)
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [form, setForm] = useState({ saleDate: today, product: null, variantId: '', amountPaid: '', note: '' })
  const [dateFilter, setDateFilter] = useState('')
  const [searchFilter, setSearchFilter] = useState('')
  const [editingId, setEditingId] = useState(null)

  const reloadSales = async () => {
    const { sales: rows } = await api.sales()
    setSales(rows)
  }

  useEffect(() => {
    Promise.all([api.products(), api.sales()])
      .then(([catalog, salesData]) => {
        setProducts(catalog.products)
        setCatalogMeta(catalog)
        setSales(salesData.sales)
        setLoading(false)
      })
      .catch((err) => { setError(err.message); setLoading(false) })
  }, [])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(''), 3500)
    return () => clearTimeout(t)
  }, [notice])

  const selectedVariant = form.product?.options?.find((o) => o.id === form.variantId) || null
  const websitePrice = selectedVariant?.websitePrice ?? form.product?.websitePrice ?? 0
  // The API supplies the supplier price with the catalogue, so the form and the
  // saved record always use the same markup ladder.
  const actualPrice = selectedVariant?.actualPrice ?? form.product?.actualPrice ?? 0
  const profit = (Number(form.amountPaid) || 0) - actualPrice

  const filteredSales = useMemo(() => {
    const needle = searchFilter.trim().toLowerCase()
    return sales.filter((s) => {
      if (dateFilter && s.sale_date !== dateFilter) return false
      if (needle && !(`${s.product_name} ${s.variant_label || ''}`.toLowerCase().includes(needle))) return false
      return true
    })
  }, [sales, dateFilter, searchFilter])

  const totals = summary(filteredSales)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.product) return setError('Choose a product first.')
    if (!form.saleDate) return setError('Choose the sale date.')
    if (form.amountPaid === '') return setError('Enter the amount paid by the customer.')
    try {
      const payload = {
        saleDate: form.saleDate,
        productId: form.product.id,
        productName: form.product.name,
        variantId: form.variantId || null,
        variantLabel: selectedVariant?.label || '',
        websitePrice,
        amountPaid: Number(form.amountPaid),
        note: form.note,
      }
      if (editingId) await api.updateSale(editingId, payload)
      else await api.addSale(payload)
      await reloadSales()
      setNotice(editingId ? 'Sale updated.' : 'Sale recorded.')
      setForm({ saleDate: today, product: null, variantId: '', amountPaid: '', note: '' })
      setEditingId(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const startEdit = (sale) => {
    const product = products.find((p) => String(p.id) === String(sale.product_id)) || {
      id: sale.product_id,
      name: sale.product_name,
      websitePrice: sale.website_price,
      actualPrice: sale.actual_price,
      options: sale.variant_id ? [{ id: sale.variant_id, label: sale.variant_label || '', websitePrice: sale.website_price, actualPrice: sale.actual_price }] : [],
    }
    setForm({
      saleDate: sale.sale_date,
      product,
      variantId: sale.variant_id || '',
      amountPaid: String(sale.amount_paid),
      note: sale.note || '',
    })
    setEditingId(sale.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const remove = async (id) => {
    if (!window.confirm('Delete this sale record?')) return
    await api.deleteSale(id)
    await reloadSales()
    setNotice('Sale deleted.')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">FAYFASHIONCART</p>
          <h1>Sales Book</h1>
        </div>
        <div className="top-actions">
          <a className="button ghost" href="/api/sales/export" download="fayfashion-sales.csv">Export CSV</a>
          <button className="button primary" onClick={() => document.getElementById('record-form')?.scrollIntoView({ behavior: 'smooth' })}>+ Record sale</button>
        </div>
      </header>

      {notice && <div className="notice ok">{notice}</div>}
      {error && <div className="notice error">{error}</div>}

      <section className="stats">
        <article><span>Records shown</span><strong>{totals.count}</strong></article>
        <article><span>Total paid</span><strong>{formatNaira(totals.totalPaid)}</strong></article>
        <article><span>Actual/source total</span><strong>{formatNaira(totals.totalActual)}</strong></article>
        <article className="profit"><span>Total profit</span><strong>{formatNaira(totals.totalProfit)}</strong></article>
      </section>

      <section className="card form-card" id="record-form">
        <div className="card-head">
          <div>
            <h2>{editingId ? 'Edit sale' : 'Record a sale'}</h2>
            <p>Choose the product, enter what the customer paid, and profit is calculated from the supplier price.</p>
          </div>
          <div className="catalog-status">
            {catalogMeta ? `Catalogue: ${catalogMeta.total} products · synced ${catalogMeta.syncedAt ? new Date(catalogMeta.syncedAt).toLocaleDateString() : 'recently'}` : loading ? 'Loading catalogue…' : 'Catalogue unavailable'}
          </div>
        </div>
        <form onSubmit={submit} className="sale-form">
          <label>Date<input type="date" value={form.saleDate} onChange={(e) => setForm({ ...form, saleDate: e.target.value })} /></label>
          <label className="product-field">
            Product
            <ProductPicker
              products={products}
              selected={form.product}
              onSelect={(p) => setForm({ ...form, product: p, variantId: '' })}
            />
          </label>
          {form.product?.options?.length > 0 && (
            <label>Variant
              <select value={form.variantId} onChange={(e) => setForm({ ...form, variantId: e.target.value })}>
                <option value="">Choose a variant…</option>
                {form.product.options.map((o) => (
                  <option key={o.id} value={o.id} disabled={o.inStock === false}>
                    {o.label} — {formatNaira(o.websitePrice)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>Website price<input value={formatNaira(websitePrice)} readOnly /></label>
          <label>Actual price<input value={formatNaira(actualPrice)} readOnly /></label>
          <label>Amount paid<input type="number" min="0" step="1" value={form.amountPaid} placeholder="₦0" onChange={(e) => setForm({ ...form, amountPaid: e.target.value })} /></label>
          <label>Profit<input className={profit < 0 ? 'negative' : ''} value={formatNaira(profit)} readOnly /></label>
          <label className="note-field">Note<input value={form.note} placeholder="Optional" onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          <div className="form-actions">
            <button className="button primary" type="submit">{editingId ? 'Save changes' : 'Add record'}</button>
            {editingId && <button className="button ghost" type="button" onClick={() => { setEditingId(null); setForm({ saleDate: today, product: null, variantId: '', amountPaid: '', note: '' }) }}>Cancel</button>}
          </div>
        </form>
      </section>

      <section className="card table-card">
        <div className="card-head compact">
          <div><h2>All records</h2><p>Stored in the sales database — not in your browser.</p></div>
          <div className="filters">
            <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} aria-label="Filter by date" />
            <input value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} placeholder="Filter product…" aria-label="Filter by product" />
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Product</th><th>Variant</th><th>Website price</th><th>Actual price</th><th>Amount paid</th><th>Profit</th><th>Note</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.length === 0 && <tr><td colSpan="9" className="empty">No sale records yet. Add one above.</td></tr>}
              {filteredSales.map((s) => (
                <tr key={s.id}>
                  <td>{new Date(`${String(s.sale_date).slice(0, 10)}T12:00:00`).toLocaleDateString()}</td>
                  <td><strong>{s.product_name}</strong></td>
                  <td>{s.variant_label || '—'}</td>
                  <td>{formatNaira(s.website_price)}</td>
                  <td>{formatNaira(s.actual_price)}</td>
                  <td>{formatNaira(s.amount_paid)}</td>
                  <td className={Number(s.profit) < 0 ? 'negative' : 'positive'}>{formatNaira(s.profit)}</td>
                  <td>{s.note || '—'}</td>
                  <td className="row-actions">
                    <button type="button" onClick={() => startEdit(s)} aria-label={`Edit ${s.product_name}`}>Edit</button>
                    <button type="button" onClick={() => remove(s.id)} aria-label={`Delete ${s.product_name}`}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
            {filteredSales.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan="3">Totals ({totals.count})</td>
                  <td>—</td>
                  <td>{formatNaira(totals.totalActual)}</td>
                  <td>{formatNaira(totals.totalPaid)}</td>
                  <td className="positive">{formatNaira(totals.totalProfit)}</td>
                  <td colSpan="2"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
      <p className="footer-note">Prices are read live from fayfashioncart.com.ng and the markup is reversed using the storefront's own price ladder.</p>
    </div>
  )
}
