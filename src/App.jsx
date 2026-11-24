import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'
import Login from './Login'
import { balanceDue, formatNaira, paymentLabel, paymentStatus } from '../shared/pricing'

const today = new Date().toISOString().slice(0, 10)

function Icon({ name, size = 18 }) {
  const paths = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    list: (
      <>
        <path d="M8 6h13M8 12h13M8 18h13" />
        <circle cx="4" cy="6" r="1" />
        <circle cx="4" cy="12" r="1" />
        <circle cx="4" cy="18" r="1" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
        <path d="M4 17v3h16v-3" />
      </>
    ),
    logout: (
      <>
        <path d="m10 17 5-5-5-5" />
        <path d="M15 12H3" />
        <path d="M11 4h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.2-3.2" />
      </>
    ),
    wallet: (
      <>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18M16 14h2" />
      </>
    ),
    layers: (
      <>
        <path d="m12 3 9 5-9 5-9-5 9-5Z" />
        <path d="m3 13 9 5 9-5" />
      </>
    ),
    trend: (
      <>
        <path d="m3 17 6-6 4 4 8-8" />
        <path d="M15 7h6v6" />
      </>
    ),
    receipt: (
      <>
        <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
        <path d="M9 8h6M9 12h6" />
      </>
    ),
    alert: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16h.01" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name] || paths.grid}
    </svg>
  )
}

function summary(sales) {
  const totalWebsite = sales.reduce((sum, s) => sum + Number(s.website_price || 0), 0)
  const totalPaid = sales.reduce((sum, s) => sum + Number(s.amount_paid || 0), 0)
  const totalActual = sales.reduce((sum, s) => sum + Number(s.actual_price || 0), 0)
  const totalProfit = sales.reduce((sum, s) => sum + Number(s.profit || 0), 0)
  const totalBalance = sales.reduce((sum, s) => sum + balanceDue(s.website_price, s.amount_paid), 0)
  const balanceCount = sales.filter((s) => balanceDue(s.website_price, s.amount_paid) > 0).length
  return { count: sales.length, totalWebsite, totalPaid, totalActual, totalProfit, totalBalance, balanceCount }
}

function initials(name) {
  return String(name || 'FF').trim().slice(0, 2).toUpperCase()
}

function formatDate(value) {
  return new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
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
      <div className="input-with-icon">
        <Icon name="search" size={16} />
        <input
          value={open ? query : selected?.name || ''}
          placeholder={products.length ? 'Search product name or category…' : 'Loading catalogue…'}
          onFocus={() => { setOpen(true); setQuery('') }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          aria-label="Search product"
          aria-expanded={open}
          autoComplete="off"
        />
      </div>
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

function Dashboard({ user, onLogout }) {
  const [products, setProducts] = useState([])
  const [catalogMeta, setCatalogMeta] = useState(null)
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [activeNav, setActiveNav] = useState('overview')

  const [form, setForm] = useState({ saleDate: today, customerName: '', product: null, variantId: '', amountPaid: '', note: '' })
  const [dateFilter, setDateFilter] = useState('')
  const [searchFilter, setSearchFilter] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('')
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
        setError('')
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
  const balance = balanceDue(websitePrice, Number(form.amountPaid) || 0)
  const status = paymentStatus(websitePrice, Number(form.amountPaid) || 0)
  const profit = (Number(form.amountPaid) || 0) - actualPrice

  const filteredSales = useMemo(() => {
    const needle = searchFilter.trim().toLowerCase()
    return sales.filter((s) => {
      if (dateFilter && s.sale_date !== dateFilter) return false
      if (paymentFilter && paymentStatus(s.website_price, s.amount_paid) !== paymentFilter) return false
      if (needle && !(`${s.customer_name || ''} ${s.product_name} ${s.variant_label || ''}`.toLowerCase().includes(needle))) return false
      return true
    })
  }, [sales, dateFilter, paymentFilter, searchFilter])

  const totals = summary(filteredSales)

  const scrollToForm = () => {
    setActiveNav('record-form')
    document.getElementById('record-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const navItems = [
    { id: 'overview', label: 'Overview', icon: 'grid', href: '#overview' },
    { id: 'record-form', label: 'Record sale', icon: 'plus', href: '#record-form' },
    { id: 'records', label: 'Records', icon: 'list', href: '#records' },
  ]

  const statCards = [
    { label: 'Records shown', value: loading ? '—' : String(totals.count), hint: 'In current filter', icon: 'receipt' },
    { label: 'Total paid', value: loading ? '—' : formatNaira(totals.totalPaid), hint: 'Cash received', icon: 'wallet' },
    {
      label: 'Balance due',
      value: loading ? '—' : formatNaira(totals.totalBalance),
      hint: loading ? 'Tracking unpaid amounts' : `${totals.balanceCount} record${totals.balanceCount === 1 ? '' : 's'} owing`,
      icon: 'alert',
      tone: 'balance',
    },
    { label: 'Total profit', value: loading ? '—' : formatNaira(totals.totalProfit), hint: 'Paid minus cost', icon: 'trend', tone: 'profit' },
  ]

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.product) return setError('Choose a product first.')
    if (!form.saleDate) return setError('Choose the sale date.')
    if (form.amountPaid === '') return setError('Enter the amount paid by the customer.')
    if (balance > 0 && !form.customerName.trim()) return setError('Add the customer name because this sale has a balance.')
    try {
      const payload = {
        saleDate: form.saleDate,
        customerName: form.customerName.trim(),
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
      setForm({ saleDate: today, customerName: '', product: null, variantId: '', amountPaid: '', note: '' })
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
      customerName: sale.customer_name || '',
      product,
      variantId: sale.variant_id || '',
      amountPaid: String(sale.amount_paid),
      note: sale.note || '',
    })
    setEditingId(sale.id)
    scrollToForm()
  }

  const remove = async (id) => {
    if (!window.confirm('Delete this sale record?')) return
    await api.deleteSale(id)
    await reloadSales()
    setNotice('Sale deleted.')
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">F</span>
          <span className="brand-copy">
            <strong>FayFashionCart</strong>
            <small>Sales workspace</small>
          </span>
        </div>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          <p className="nav-label">Workspace</p>
          {navItems.map((item) => (
            <a
              key={item.id}
              href={item.href}
              className={`nav-link ${activeNav === item.id ? 'active' : ''}`}
              aria-current={activeNav === item.id ? 'page' : undefined}
              onClick={() => setActiveNav(item.id)}
            >
              <Icon name={item.icon} size={17} />
              {item.label}
            </a>
          ))}
          <p className="nav-label">Data</p>
          <a className="nav-link" href="/api/sales/export" download="fayfashion-sales.csv">
            <Icon name="download" size={17} />
            Export CSV
          </a>
        </nav>

        <div className="sidebar-foot">
          <div className="user-chip">
            <span className="user-avatar">{initials(user)}</span>
            <span className="user-copy">
              <strong>{user}</strong>
              <small>Administrator</small>
            </span>
          </div>
          <button className="button ghost full" onClick={onLogout}>
            <Icon name="logout" size={16} />
            Log out
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="page-heading">
            <p className="eyebrow">PRIVATE WORKSPACE</p>
            <h1>Sales Book</h1>
            <p>Record daily sales, supplier cost, and profit in one secure place.</p>
          </div>
          <div className="top-actions">
            <a className="button ghost" href="/api/sales/export" download="fayfashion-sales.csv">
              <Icon name="download" size={16} />
              Export CSV
            </a>
            <button className="button primary" onClick={scrollToForm}>
              <Icon name="plus" size={16} />
              Record sale
            </button>
          </div>
        </header>

        {notice && <div className="notice ok">{notice}</div>}
        {error && <div className="notice error">{error}</div>}

        <section className="overview" id="overview">
          <div className="section-heading">
            <h2>Overview</h2>
            <span>Live totals for the current filter</span>
          </div>
          <div className="stats">
            {statCards.map((stat) => (
              <article className={`stat-card ${stat.tone || ''}`} key={stat.label}>
                <div className="stat-top">
                  <span>{stat.label}</span>
                  <span className="stat-icon"><Icon name={stat.icon} size={17} /></span>
                </div>
                <strong className={stat.tone === 'profit' && totals.totalProfit < 0 ? 'negative' : ''}>{stat.value}</strong>
                <small>{stat.hint}</small>
              </article>
            ))}
          </div>
        </section>

        <section className="card form-card" id="record-form">
          <div className="card-head">
            <div>
              <h2>{editingId ? 'Edit sale' : 'Record a sale'}</h2>
              <p>Add the customer name when a payment is not in full. The balance due is calculated from the website price.</p>
            </div>
            <div className={`catalog-badge ${catalogMeta ? 'online' : loading ? 'loading' : 'offline'}`}>
              <span className="status-dot" />
              {catalogMeta
                ? `${catalogMeta.total} products · synced ${catalogMeta.syncedAt ? new Date(catalogMeta.syncedAt).toLocaleDateString() : 'recently'}`
                : loading ? 'Loading catalogue…' : 'Catalogue unavailable'}
            </div>
          </div>
          <form onSubmit={submit} className="sale-form">
            <label className="date-field">
              Date
              <input type="date" value={form.saleDate} onChange={(e) => setForm({ ...form, saleDate: e.target.value })} />
            </label>
            <label className="customer-field">
              Customer name
              <input
                value={form.customerName}
                placeholder="Required if they still owe"
                autoComplete="name"
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
              />
            </label>
            <label className="product-field">
              Product
              <ProductPicker
                products={products}
                selected={form.product}
                onSelect={(p) => setForm({ ...form, product: p, variantId: '' })}
              />
            </label>
            {form.product?.options?.length > 0 && (
              <label className="variant-field">
                Variant
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
            <label className="price-field">
              Website price
              <input value={formatNaira(websitePrice)} readOnly />
            </label>
            <label className="price-field">
              Actual price
              <input value={formatNaira(actualPrice)} readOnly />
            </label>
            <label className="amount-field">
              Amount paid
              <input type="number" min="0" step="1" value={form.amountPaid} placeholder="₦0" onChange={(e) => setForm({ ...form, amountPaid: e.target.value })} />
            </label>
            <label className={`balance-field ${balance > 0 ? 'due' : ''}`}>
              Balance due
              <input className={balance > 0 ? 'due' : ''} value={formatNaira(balance)} readOnly />
              <small className={`field-hint ${status}`}>{paymentLabel(status)}</small>
            </label>
            <label className="price-field">
              Profit
              <input className={profit < 0 ? 'negative' : ''} value={formatNaira(profit)} readOnly />
            </label>
            <label className="note-field">
              Note
              <input value={form.note} placeholder="Optional detail for this sale" onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </label>
            <div className="form-actions">
              {editingId && (
                <button className="button ghost" type="button" onClick={() => { setEditingId(null); setForm({ saleDate: today, customerName: '', product: null, variantId: '', amountPaid: '', note: '' }) }}>
                  Cancel
                </button>
              )}
              <button className="button primary" type="submit">
                <Icon name={editingId ? 'receipt' : 'plus'} size={16} />
                {editingId ? 'Save changes' : 'Add record'}
              </button>
            </div>
          </form>
        </section>

        <section className="card table-card" id="records">
          <div className="card-head compact">
            <div>
              <h2>All records</h2>
              <p>Stored in the sales database — not in your browser.</p>
            </div>
            <div className="filters">
              <label className="filter-field">
                <Icon name="receipt" size={15} />
                <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} aria-label="Filter by date" />
              </label>
              <label className="filter-field">
                <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} aria-label="Filter by payment status">
                  <option value="">All payments</option>
                  <option value="paid">Paid</option>
                  <option value="partial">Partial</option>
                  <option value="unpaid">Unpaid</option>
                </select>
              </label>
              <label className="filter-field">
                <Icon name="search" size={15} />
                <input value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} placeholder="Filter customer or product…" aria-label="Filter by customer or product" />
              </label>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <caption className="sr-only">FayFashionCart sale records</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Product</th>
                  <th scope="col">Website price</th>
                  <th scope="col">Amount paid</th>
                  <th scope="col">Balance due</th>
                  <th scope="col">Profit</th>
                  <th scope="col">Note</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan="9">
                      <div className="empty-state">
                        <span className="empty-icon"><Icon name="list" size={22} /></span>
                        <strong>Loading records…</strong>
                        <span>Fetching your sales from the database.</span>
                      </div>
                    </td>
                  </tr>
                )}
                {!loading && filteredSales.length === 0 && (
                  <tr>
                    <td colSpan="9">
                      <div className="empty-state">
                        <span className="empty-icon"><Icon name="receipt" size={22} /></span>
                        <strong>No sale records yet</strong>
                        <span>Record a sale to see totals, profit, and unpaid balances here.</span>
                        <button className="button primary" type="button" onClick={scrollToForm}>Record first sale</button>
                      </div>
                    </td>
                  </tr>
                )}
                {!loading && filteredSales.map((s) => {
                  const rowBalance = balanceDue(s.website_price, s.amount_paid)
                  const rowStatus = paymentStatus(s.website_price, s.amount_paid)
                  return (
                    <tr key={s.id}>
                      <td>{formatDate(s.sale_date)}</td>
                      <td className={!s.customer_name && rowBalance > 0 ? 'missing-customer' : ''}>
                        {s.customer_name || (rowBalance > 0 ? 'Unknown' : '—')}
                      </td>
                      <td>
                        <span className="product-cell">
                          <strong>{s.product_name}</strong>
                          {s.variant_label && <small>{s.variant_label}</small>}
                        </span>
                      </td>
                      <td>{formatNaira(s.website_price)}</td>
                      <td>{formatNaira(s.amount_paid)}</td>
                      <td className="balance-cell">
                        <span className={rowBalance > 0 ? 'balance-due' : ''}>{formatNaira(rowBalance)}</span>
                        <span className={`status-pill ${rowStatus}`}>{paymentLabel(rowStatus)}</span>
                      </td>
                      <td className={Number(s.profit) < 0 ? 'negative' : 'positive'}>{formatNaira(s.profit)}</td>
                      <td>{s.note || '—'}</td>
                      <td className="row-actions">
                        <button type="button" onClick={() => startEdit(s)} aria-label={`Edit ${s.product_name}`}>Edit</button>
                        <button type="button" onClick={() => remove(s.id)} aria-label={`Delete ${s.product_name}`}>Delete</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {!loading && filteredSales.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan="3">Totals ({totals.count})</td>
                    <td>{formatNaira(totals.totalWebsite)}</td>
                    <td>{formatNaira(totals.totalPaid)}</td>
                    <td className={totals.totalBalance > 0 ? 'balance-due' : ''}>{formatNaira(totals.totalBalance)}</td>
                    <td className={totals.totalProfit < 0 ? 'negative' : 'positive'}>{formatNaira(totals.totalProfit)}</td>
                    <td colSpan="2"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>

        <footer className="footer-note">
          <Icon name="lock" size={14} />
          Prices are read live from fayfashioncart.com.ng and the markup is reversed using the storefront's own price ladder.
        </footer>
      </main>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState({ status: 'loading', username: '' })

  useEffect(() => {
    let active = true
    api.session()
      .then((data) => {
        if (!active) return
        setSession(data.authenticated
          ? { status: 'authenticated', username: data.username || '' }
          : { status: 'guest', username: '' })
      })
      .catch(() => { if (active) setSession({ status: 'guest', username: '' }) })
    return () => { active = false }
  }, [])

  const logout = async () => {
    try { await api.logout() } finally { setSession({ status: 'guest', username: '' }) }
  }

  if (session.status === 'loading') {
    return (
      <main className="auth-loading">
        <span className="brand-mark">F</span>
        <span>Preparing your workspace…</span>
      </main>
    )
  }
  if (session.status !== 'authenticated') {
    return <Login onSuccess={(username) => setSession({ status: 'authenticated', username })} />
  }
  return <Dashboard user={session.username} onLogout={logout} />
}
