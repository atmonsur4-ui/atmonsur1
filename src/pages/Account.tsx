import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Icon } from '../components/Icon'
import { accountApi, formatKobo, type PastOrder } from '../lib/api'
import { Link, navigate, useLocation } from '../lib/router'
import { useStore } from '../lib/store'

const formData = (e: FormEvent<HTMLFormElement>) => Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>
// Only same-site paths, so a crafted ?next= link can't send people to another website after login.
const safeNext = (v: string | null) => (v && v.startsWith('/') && !v.startsWith('//') ? v : '/account')

/** Runs an async form action with busy/error/success state. */
function useAction() {
  const [state, setState] = useState<{ busy: boolean; error: string; done: string }>({ busy: false, error: '', done: '' })
  const run = async (fn: () => Promise<string | void>) => {
    setState({ busy: true, error: '', done: '' })
    try { setState({ busy: false, error: '', done: (await fn()) ?? '' }) } catch (e) { setState({ busy: false, error: (e as Error).message, done: '' }) }
  }
  const messages = <div role="status" aria-live="polite">
    {state.error && <p className="form-error">{state.error}</p>}
    {state.done && <p className="form-success">{state.done}</p>}
  </div>
  return { ...state, run, messages }
}

function Shell({ title, kicker = 'Your account', children }: { title: string; kicker?: string; children: ReactNode }) {
  return <>
    <section className="contact-hero"><div className="shell"><span className="kicker light">{kicker}</span><h1>{title}</h1></div></section>
    <section className="section shell account-layout">{children}</section>
  </>
}

export function Account() {
  const { path } = useLocation()
  const { account, accountLoaded } = useStore()
  if (path === '/account/verify') return <Verify />
  if (path === '/account/reset') return <Reset />
  if (!accountLoaded) return <section className="section shell" role="status">Loading…</section>
  return account ? <Dashboard /> : <SignIn />
}

function SignIn() {
  const { query } = useLocation()
  const { setAccount } = useStore()
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>(query.get('mode') === 'signup' ? 'signup' : 'login')
  const action = useAction()
  const next = safeNext(query.get('next'))

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = formData(e)
    action.run(async () => {
      if (mode === 'forgot') {
        await accountApi.forgot(f.email)
        return 'If an account exists for that email, we’ve sent a link to reset your password. It works for 1 hour.'
      }
      const { customer } = mode === 'login' ? await accountApi.login(f) : await accountApi.signup(f)
      setAccount(customer)
      navigate(next)
    })
  }

  return <Shell title={mode === 'signup' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : 'Log in'}>
    <form className="enquiry-form account-card" onSubmit={submit} key={mode}>
      {mode !== 'forgot' && <div className="tabs" role="group" aria-label="Log in or create account">
        <button type="button" aria-pressed={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Log in</button>
        <button type="button" aria-pressed={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Create account</button>
      </div>}
      {mode === 'signup' && <div className="form-grid">
        <label>Full name<input required name="name" autoComplete="name" minLength={2} maxLength={100} /></label>
        <label>Phone number<input required name="phone" type="tel" autoComplete="tel" maxLength={20} placeholder="+234" /></label>
      </div>}
      <label>Email address<input required name="email" type="email" autoComplete="email" maxLength={200} /></label>
      {mode !== 'forgot' && <label>Password<input required name="password" type="password" minLength={mode === 'signup' ? 8 : 1} maxLength={200}
        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />{mode === 'signup' && <small className="field-hint">At least 8 characters.</small>}</label>}
      {action.messages}
      <button className="button primary w-full" disabled={action.busy}>{action.busy ? 'Please wait…' : mode === 'login' ? 'Log in' : mode === 'signup' ? 'Create account' : 'Send reset link'}</button>
      <p className="account-links">
        {mode === 'login' && <button type="button" className="text-link" onClick={() => setMode('forgot')}>Forgot your password?</button>}
        {mode === 'forgot' && <button type="button" className="text-link" onClick={() => setMode('login')}>Back to log in</button>}
      </p>
    </form>
    <div className="account-aside">
      <h2>Why create an account?</h2>
      <ul className="tick-list"><li>See all your orders and their delivery status</li><li>Order again in one tap</li><li>Your details are filled in at checkout</li></ul>
      <p className="muted">You can still check out as a guest. <Link className="underline" to="/shop">Continue shopping</Link></p>
    </div>
  </Shell>
}

function Dashboard() {
  const { account, setAccount, catalogue, reorder, setCartOpen } = useStore()
  const [orders, setOrders] = useState<PastOrder[] | null>(null)
  const [ordersError, setOrdersError] = useState('')
  const [notice, setNotice] = useState('')
  const profile = useAction(), password = useAction(), resend = useAction()

  useEffect(() => { accountApi.orders().then(r => setOrders(r.orders), e => setOrdersError(e.message)) }, [])
  if (!account) return null

  const orderAgain = (o: PastOrder) => {
    const missing = reorder(o.items)
    setNotice(missing.length ? `Added to your cart. No longer available: ${missing.join(', ')}.` : 'Added to your cart.')
    setCartOpen(true)
  }
  const logout = async () => { await accountApi.logout().catch(() => {}); setAccount(null); navigate('/') }

  return <Shell title={`Hello, ${account.name.split(' ')[0]}`}>
    <div className="account-main">
      {!account.email_verified && <div className="order-banner unpaid">
        <p><b>Please confirm your email address.</b> We sent a link to {account.email}. Once confirmed, earlier orders you placed as a guest with this email will appear here too.</p>
        {resend.messages}
        <button className="text-link" disabled={resend.busy} onClick={() => resend.run(async () => { await accountApi.resendVerification(); return 'Sent. Check your inbox (and spam folder).' })}>Send the link again</button>
      </div>}

      <h2 id="orders-h">Your orders</h2>
      <div role="status" aria-live="polite">{notice && <p className="form-success">{notice}</p>}</div>
      {ordersError ? <p className="form-error">{ordersError}</p>
        : !orders ? <p role="status">Loading your orders…</p>
        : orders.length === 0 ? <div className="empty">No orders yet. <Link className="underline" to="/shop">Start shopping</Link></div>
        : <ul className="order-list" aria-labelledby="orders-h">{orders.map(o => <li key={o.reference} className="order-card">
          <div className="order-card-head">
            <div><b>{new Date(o.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</b><span className="muted">{o.reference}</span></div>
            <span className={`pill ${o.status === 'paid' || o.payment_method === 'on_delivery' ? o.fulfilment : 'pending'}`}>{orderLabel(o)}</span>
          </div>
          <p className="order-items">{o.items.map(i => `${i.qty} × ${i.name}`).join(', ')}</p>
          <div className="order-card-foot"><b>{formatKobo(o.total_kobo)}</b>
            <span><Link className="text-link inline-flex" to={`/order?reference=${o.reference}`}>View</Link>
              {catalogue && <button className="button secondary small" onClick={() => orderAgain(o)}><Icon name="cart" size={16} /> Order again</button>}</span></div>
        </li>)}</ul>}
    </div>

    <div className="account-aside">
      <form className="enquiry-form" onSubmit={e => { e.preventDefault(); const f = formData(e); profile.run(async () => { setAccount((await accountApi.profile(f)).customer); return 'Saved.' }) }}>
        <h2>Your details</h2>
        <p className="muted">{account.email}</p>
        <label>Full name<input required name="name" defaultValue={account.name} autoComplete="name" maxLength={100} /></label>
        <label>Phone number<input required name="phone" type="tel" defaultValue={account.phone} autoComplete="tel" maxLength={20} /></label>
        <label>Usual delivery option<select name="delivery_zone" defaultValue={account.delivery_zone ?? ''}><option value="">Choose at checkout</option>{catalogue?.zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}</select></label>
        <label>Delivery address<input name="address" defaultValue={account.address ?? ''} autoComplete="street-address" maxLength={300} /></label>
        <label>Town / city<input name="city" defaultValue={account.city ?? ''} autoComplete="address-level2" maxLength={100} /></label>
        {profile.messages}
        <button className="button primary" disabled={profile.busy}>Save details</button>
      </form>

      <form className="enquiry-form" onSubmit={e => { e.preventDefault(); const f = formData(e); const form = e.currentTarget; password.run(async () => { await accountApi.password(f.current, f.password); form.reset(); return 'Password changed. Other devices have been logged out.' }) }}>
        <h2>Change password</h2>
        <label>Current password<input required name="current" type="password" autoComplete="current-password" /></label>
        <label>New password<input required name="password" type="password" minLength={8} maxLength={200} autoComplete="new-password" /></label>
        {password.messages}
        <button className="button secondary" disabled={password.busy}>Change password</button>
      </form>

      <button className="text-link" onClick={logout}>Log out</button>
    </div>
  </Shell>
}

const statusLabel: Record<string, string> = { new: 'Paid · preparing', dispatched: 'On its way', delivered: 'Delivered', cancelled: 'Cancelled' }
const orderLabel = (o: PastOrder) => o.status === 'paid' ? statusLabel[o.fulfilment] ?? o.fulfilment
  : o.payment_method !== 'on_delivery' ? 'Not paid'
  : o.fulfilment === 'cancelled' ? 'Cancelled' : o.fulfilment === 'dispatched' ? 'On its way · pay on delivery' : o.fulfilment === 'delivered' ? 'Delivered' : 'Placed · pay on delivery'

function Verify() {
  const { query } = useLocation()
  const { setAccount } = useStore()
  const [state, setState] = useState<'working' | 'done' | string>('working')
  const started = useRef(false) // tokens are single use: never redeem twice
  useEffect(() => {
    if (started.current) return
    started.current = true
    accountApi.verify(query.get('token') ?? '')
      .then(() => accountApi.me()) // refresh from the server: the link may be opened while logged out
      .then(r => { setAccount(r.customer); setState('done') }, e => setState(e.message))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return <Shell title={state === 'done' ? 'Email confirmed' : state === 'working' ? 'Confirming…' : 'Link not valid'}>
    <div className="account-card" role="status">
      {state === 'done' ? <p>Thank you. Your email is confirmed, and any earlier orders placed with it now appear in your account.</p> : state !== 'working' && <p className="form-error">{state}</p>}
      <Link to="/account" className="button primary">Go to your account <Icon name="arrow" /></Link>
    </div>
  </Shell>
}

function Reset() {
  const { query } = useLocation()
  const { setAccount } = useStore()
  const action = useAction()
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = formData(e)
    action.run(async () => {
      if (f.password !== f.confirm) throw new Error('The two passwords don’t match.')
      setAccount((await accountApi.reset(query.get('token') ?? '', f.password)).customer)
      navigate('/account')
    })
  }
  return <Shell title="Choose a new password">
    <form className="enquiry-form account-card" onSubmit={submit}>
      <label>New password<input required name="password" type="password" minLength={8} maxLength={200} autoComplete="new-password" /><small className="field-hint">At least 8 characters.</small></label>
      <label>Type it again<input required name="confirm" type="password" minLength={8} maxLength={200} autoComplete="new-password" /></label>
      {action.messages}
      <button className="button primary w-full" disabled={action.busy}>Save new password</button>
    </form>
  </Shell>
}
