import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Icon } from '../components/Icon'
import { accountApi, formatKobo, type AccountSummary, type PastOrder, type SavedAddress } from '../lib/api'
import { ProductCard } from '../components/Product'
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
  return account ? <Dashboard tab={TABS.find(t => t[0] === path)?.[0] ?? '/account'} /> : <SignIn />
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

const TABS = [
  ['/account', 'Overview'], ['/account/orders', 'Orders'], ['/account/addresses', 'Addresses'],
  ['/account/favourites', 'Favourites'], ['/account/settings', 'Settings'],
] as const
type Tab = (typeof TABS)[number][0]

function Dashboard({ tab }: { tab: Tab }) {
  const { account } = useStore()
  const resend = useAction()
  if (!account) return null
  return <Shell title={tab === '/account' ? `Hello, ${account.name.split(' ')[0]}` : TABS.find(t => t[0] === tab)![1]}>
    <div className="account-wide">
      <nav className="account-tabs" aria-label="Account">
        {TABS.map(([to, label]) => <Link key={to} to={to} aria-current={tab === to ? 'page' : undefined}>{label}</Link>)}
      </nav>
      {!account.email_verified && <div className="order-banner unpaid">
        <p><b>Please confirm your email address.</b> We sent a link to {account.email}. Once confirmed, earlier orders you placed as a guest with this email will appear here too.</p>
        {resend.messages}
        <button className="text-link" disabled={resend.busy} onClick={() => resend.run(async () => { await accountApi.resendVerification(); return 'Sent. Check your inbox (and spam folder).' })}>Send the link again</button>
      </div>}
      {tab === '/account' ? <Overview /> : tab === '/account/orders' ? <Orders /> : tab === '/account/addresses' ? <Addresses />
        : tab === '/account/favourites' ? <Favourites /> : <Settings />}
    </div>
  </Shell>
}

function Overview() {
  const { account } = useStore()
  const [s, setS] = useState<AccountSummary | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { accountApi.summary().then(setS, e => setError(e.message)) }, [])
  if (error) return <p className="form-error">{error}</p>
  if (!s || !account) return <p role="status">Loading…</p>
  const last = s.last_order
  return <>
    <div className="overview-stats">
      <Link to="/account/orders" className="overview-link"><small>Orders</small><b>{s.orders}</b><span>placed with this account</span></Link>
      <div><small>Total spent</small><b>{formatKobo(s.spent_kobo)}</b><span>on paid orders</span></div>
      <Link to="/account/addresses" className="overview-link"><small>Saved addresses</small><b>{s.addresses}</b><span>{s.addresses ? 'used at checkout' : 'add one for faster checkout'}</span></Link>
      <div><small>Member since</small><b>{new Date(account.member_since).toLocaleDateString('en-NG', { month: 'short', year: 'numeric' })}</b><span>{account.email}</span></div>
    </div>
    <h2 className="detail-h">Latest order</h2>
    {last ? <div className="order-card">
      <div className="order-card-head"><div><b>{new Date(last.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</b><span className="muted">{last.reference}</span></div>
        <span className={`pill ${last.fulfilment}`}>{orderLabel(last as PastOrder)}</span></div>
      <div className="order-card-foot"><b>{formatKobo(last.total_kobo)}</b><Link className="text-link inline-flex" to={`/order?reference=${last.reference}`}>View order</Link></div>
    </div> : <div className="empty">No orders yet. <Link className="underline" to="/shop">Start shopping</Link></div>}
    <p className="flex gap-6 flex-wrap mt-6"><Link className="text-link" to="/wholesale">Bulk &amp; wholesale prices <Icon name="arrow" size={16} /></Link><Link className="text-link" to="/account/favourites">Your favourites <Icon name="arrow" size={16} /></Link></p>
  </>
}

function Orders() {
  const { catalogue, reorder, setCartOpen } = useStore()
  const [orders, setOrders] = useState<PastOrder[] | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => { accountApi.orders().then(r => setOrders(r.orders), e => setError(e.message)) }, [])
  const orderAgain = (o: PastOrder) => {
    const missing = reorder(o.items)
    setNotice(missing.length ? `Added to your cart. No longer available: ${missing.join(', ')}.` : 'Added to your cart.')
    setCartOpen(true)
  }
  return <>
    <div role="status" aria-live="polite">{notice && <p className="form-success">{notice}</p>}</div>
    {error ? <p className="form-error">{error}</p>
      : !orders ? <p role="status">Loading your orders…</p>
      : orders.length === 0 ? <div className="empty">No orders yet. <Link className="underline" to="/shop">Start shopping</Link></div>
      : <ul className="order-list">{orders.map(o => <li key={o.reference} className="order-card">
        <div className="order-card-head">
          <div><b>{new Date(o.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</b><span className="muted">{o.reference} · {o.delivery}</span></div>
          <span className={`pill ${o.status === 'paid' ? o.fulfilment : o.fulfilment === 'cancelled' ? 'cancelled' : 'pending'}`}>{orderLabel(o)}</span>
        </div>
        <p className="order-items">{o.items.map(i => `${i.qty} × ${i.name}`).join(', ')}</p>
        <div className="order-card-foot"><b>{formatKobo(o.total_kobo)}</b>
          <span><Link className="text-link inline-flex" to={`/order?reference=${o.reference}`}>View</Link>
            {catalogue && <button className="button secondary small" onClick={() => orderAgain(o)}><Icon name="cart" size={16} /> Order again</button>}</span></div>
      </li>)}</ul>}
  </>
}

function Addresses() {
  const { catalogue } = useStore()
  const zones = catalogue?.zones ?? []
  const [list, setList] = useState<SavedAddress[] | null>(null)
  const [editing, setEditing] = useState<SavedAddress | 'new' | null>(null)
  const [zoneId, setZoneId] = useState('')
  const action = useAction()
  const load = () => accountApi.addresses().then(r => setList(r.addresses), () => setList([]))
  useEffect(() => { load() }, [])
  const startEdit = (a: SavedAddress | 'new') => { setEditing(a); setZoneId(a === 'new' ? '' : a.delivery_zone) }
  const zone = zones.find(z => z.id === zoneId)
  const zoneName = (id: string) => zones.find(z => z.id === id)?.name ?? id

  if (!list) return <p role="status">Loading…</p>
  if (editing) return <form className="enquiry-form account-card" key={editing === 'new' ? 'new' : editing.id} onSubmit={e => {
    e.preventDefault()
    const f = formData(e)
    action.run(async () => {
      await accountApi.saveAddress({ ...f, delivery_zone: zoneId, is_default: f.is_default === 'on' }, editing === 'new' ? undefined : editing.id)
      await load(); setEditing(null)
    })
  }}>
    <h3 className="checkout-title">{editing === 'new' ? 'Add an address' : 'Edit address'}</h3>
    <label>Name for this address<input name="label" required maxLength={40} placeholder="e.g. Shop, Home, Office" defaultValue={editing === 'new' ? '' : editing.label} /></label>
    <fieldset className="zones"><legend>Delivery option</legend>
      {zones.map(z => <label key={z.id} className="zone"><input type="radio" name="zone_pick" required checked={zoneId === z.id} onChange={() => setZoneId(z.id)} />
        <span>{z.name}</span><b>{z.fee_kobo ? formatKobo(z.fee_kobo) : 'Free'}</b></label>)}
    </fieldset>
    {zone?.needs_address && <>
      <label>Street address<input name="address" required minLength={5} maxLength={300} autoComplete="street-address" placeholder="House number, street, area" defaultValue={editing === 'new' ? '' : editing.address ?? ''} /></label>
      <label>Town / city<input name="city" required maxLength={100} autoComplete="address-level2" defaultValue={editing === 'new' ? '' : editing.city ?? ''} /></label>
    </>}
    <label className="zone"><input type="checkbox" name="is_default" defaultChecked={editing !== 'new' && editing.is_default} /> <span>Use as my default at checkout</span></label>
    {action.messages}
    <div className="hero-ctas"><button className="button primary" disabled={action.busy}>Save address</button><button type="button" className="button secondary" onClick={() => setEditing(null)}>Cancel</button></div>
  </form>

  return <>
    {action.messages}
    {list.length === 0 && <div className="empty">No saved addresses yet. Add your shop or home address to check out faster.</div>}
    <div className="address-grid">
      {list.map(a => <div key={a.id} className={`address-card ${a.is_default ? 'default' : ''}`}>
        <b>{a.label} {a.is_default && <span className="pill paid">Default</span>}</b>
        <span className="muted">{zoneName(a.delivery_zone)}</span>
        {a.address && <span>{a.address}, {a.city}</span>}
        <div className="actions">
          <button className="text-link" onClick={() => startEdit(a)}>Edit</button>
          {!a.is_default && <button className="text-link" onClick={() => action.run(async () => { await accountApi.saveAddress({ ...a, is_default: true }, a.id); await load() })}>Make default</button>}
          <button className="text-link" onClick={() => { if (confirm(`Delete “${a.label}”?`)) action.run(async () => { await accountApi.deleteAddress(a.id); await load() }) }}>Delete</button>
        </div>
      </div>)}
    </div>
    {list.length < 10 && <button className="button primary mt-6" onClick={() => startEdit('new')}><Icon name="plus" size={16} /> Add an address</button>}
  </>
}

function Favourites() {
  const { catalogue, favourites } = useStore()
  const products = (catalogue?.products ?? []).filter(p => favourites.has(p.id))
  if (!catalogue) return <p role="status">Loading…</p>
  return products.length
    ? <div className="products-grid">{products.map(p => <ProductCard key={p.id} product={p} />)}</div>
    : <div className="empty">No favourites yet. Tap the ♥ on any product to save it here for quick reordering. <Link className="underline" to="/shop">Browse the shop</Link></div>
}

function Settings() {
  const { account, setAccount } = useStore()
  const profile = useAction(), password = useAction(), everywhere = useAction(), remove = useAction()
  if (!account) return null
  const logout = async () => { await accountApi.logout().catch(() => {}); setAccount(null); navigate('/') }
  return <div className="settings-grid">
    <form className="enquiry-form" onSubmit={e => { e.preventDefault(); const f = formData(e); profile.run(async () => { setAccount((await accountApi.profile(f)).customer); return 'Saved.' }) }}>
      <h2 className="detail-h">Your details</h2>
      <label>Email address<input value={account.email} disabled /><small className="field-hint">{account.email_verified ? 'Confirmed.' : 'Not confirmed yet.'} To change your email, contact us.</small></label>
      <label>Full name<input required name="name" defaultValue={account.name} autoComplete="name" maxLength={100} /></label>
      <label>Phone number<input required name="phone" type="tel" defaultValue={account.phone} autoComplete="tel" maxLength={20} /></label>
      {profile.messages}
      <button className="button primary" disabled={profile.busy}>Save details</button>
    </form>

    <form className="enquiry-form" onSubmit={e => { e.preventDefault(); const f = formData(e); const form = e.currentTarget; password.run(async () => { await accountApi.password(f.current, f.password); form.reset(); return 'Password changed. Other devices have been signed out.' }) }}>
      <h2 className="detail-h">Change password</h2>
      <label>Current password<input required name="current" type="password" autoComplete="current-password" /></label>
      <label>New password<input required name="password" type="password" minLength={8} maxLength={200} autoComplete="new-password" /><small className="field-hint">At least 8 characters.</small></label>
      {password.messages}
      <button className="button secondary" disabled={password.busy}>Change password</button>
    </form>

    <div className="enquiry-form">
      <h2 className="detail-h">Signing in</h2>
      <p className="muted">Lost a phone, or signed in on a shared computer? Sign out on every device, including this one.</p>
      {everywhere.messages}
      <div className="hero-ctas"><button className="button secondary" onClick={logout}>Log out</button>
        <button className="button secondary" disabled={everywhere.busy} onClick={() => everywhere.run(async () => { await accountApi.logoutEverywhere(); setAccount(null); navigate('/account') })}>Sign out everywhere</button></div>
    </div>

    <form className="enquiry-form danger-zone" onSubmit={e => {
      e.preventDefault()
      const f = formData(e)
      if (!confirm('Delete your account permanently? This cannot be undone.')) return
      remove.run(async () => { await accountApi.deleteAccount(f.password); setAccount(null); navigate('/') })
    }}>
      <h2 className="detail-h">Delete account</h2>
      <p className="muted">Deletes your account, saved addresses and favourites, and signs you out. We keep records of past orders for accounting, without linking them to an account.</p>
      <label>Enter your password to confirm<input required name="password" type="password" autoComplete="current-password" /></label>
      {remove.messages}
      <button className="button danger" disabled={remove.busy}>Delete my account</button>
    </form>
  </div>
}

const statusLabel: Record<string, string> = { new: 'Paid · preparing', dispatched: 'On its way', delivered: 'Delivered', cancelled: 'Cancelled' }
const orderLabel = (o: PastOrder) => o.status === 'paid' ? statusLabel[o.fulfilment] ?? o.fulfilment
  : o.fulfilment === 'cancelled' ? 'Cancelled'
  : o.payment_method === 'transfer' ? 'Awaiting payment' : 'Not paid'

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
