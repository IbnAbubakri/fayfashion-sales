import { useState } from 'react'
import { api } from './api'
import BrandLogo from './BrandLogo'

function Icon({ name, size = 18 }) {
  const paths = {
    lock: (
      <>
        <rect x="5" y="10" width="14" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    shield: (
      <>
        <path d="M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6l-8-3Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    receipt: (
      <>
        <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
        <path d="M9 8h6M9 12h6" />
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
      {paths[name] || paths.lock}
    </svg>
  )
}

export default function Login({ onSuccess }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const session = await api.login({ username, password })
      onSuccess(session.username)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-brand">
        <div className="brand brand-light">
          <BrandLogo inverse />
          <span className="brand-subtitle">Sales workspace</span>
        </div>

        <div className="auth-brand-copy">
          <p className="eyebrow">PRIVATE SALES WORKSPACE</p>
          <h1>Every sale, accounted for.</h1>
          <p>Record transactions, calculate supplier cost and profit instantly, and keep your books aligned with the live catalogue.</p>
        </div>

        <ul className="auth-points">
          <li><span><Icon name="check" size={15} /></span>Live product and variant pricing</li>
          <li><span><Icon name="receipt" size={15} /></span>Durable sales records and CSV export</li>
          <li><span><Icon name="shield" size={15} /></span>Private, session-protected access</li>
        </ul>

        <p className="auth-brand-foot">FayFashionCart · Sales Book</p>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-card-head">
            <p className="eyebrow">WELCOME BACK</p>
            <h2>Sign in</h2>
            <p>Use your workspace credentials to continue.</p>
          </div>

          {error && <div className="notice error" role="alert">{error}</div>}

          <form className="auth-form" onSubmit={submit}>
            <label>
              Username
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                aria-invalid={Boolean(error)}
                required
              />
            </label>
            <label>
              Password
              <span className="password-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  aria-invalid={Boolean(error)}
                  required
                />
                <button
                  className="password-toggle"
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </span>
            </label>
            <button className="button primary" type="submit" disabled={busy}>
              <Icon name="lock" size={16} />
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="auth-security">
            <Icon name="shield" size={15} />
            Your session is protected and expires after 12 hours.
          </p>
        </div>
        <p className="auth-footer">Records are stored in the database, not in this browser.</p>
      </section>
    </main>
  )
}
