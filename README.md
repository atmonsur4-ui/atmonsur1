# Atmonsur Store

Online store for Atmonsur Multiglobal Resources Ltd: retail and wholesale ordering, online payment with Paystack, and a password-protected admin area for orders, products, delivery fees and enquiries.

## How it fits together

| Part | What it is |
|---|---|
| Website (`src/`) | React + Vite + Tailwind. Built into `dist/` by `npm run build`. |
| Server (`server/src/`) | One small Node.js server ([Hono](https://hono.dev)). It serves the website, the `/api` the website uses, the Paystack webhook and the `/admin` pages. |
| Database | PostgreSQL. Tables are created automatically on first start, with starter products. |
| Payments | [Paystack](https://paystack.com): card, bank transfer and USSD. Card details never touch this server. |
| Owner emails (optional) | [Resend](https://resend.com) emails you each paid order and enquiry. |

**Recommended hosting:** [Render](https://render.com) web service for the server and [Neon](https://neon.tech) for PostgreSQL. Both have free tiers. For a live store, use Render's Starter plan (about $7/month): the free plan sleeps after 15 minutes idle, so the first visitor waits about a minute.

How a purchase works: the customer fills the cart → checkout picks a delivery option → the server re-prices everything from the database and creates a *pending* order → Paystack's payment page → back to `/order`. The order is marked *paid* only when Paystack confirms it (a signed webhook, or a direct check with Paystack), and only if the amount matches exactly.

## Go live: step by step

1. **Database.** Create a free project at neon.tech and copy its connection string (`postgres://…?sslmode=require`).
2. **Paystack.** Create or sign in to your Paystack business account. Under *Settings → API Keys & Webhooks*, copy the **test** secret key (`sk_test_…`).
3. **Deploy.** Put this folder in a GitHub repository. In Render choose *New → Blueprint*, pick the repository (it reads `render.yaml`), and fill in the environment variables it asks for:
   - `DATABASE_URL`: the Neon connection string
   - `SITE_URL`: your site address with no trailing slash, e.g. `https://atmonsur-store.onrender.com` (later your own domain)
   - `PAYSTACK_SECRET_KEY`: the test key for now
   - `ADMIN_PASSWORD`: a long password (12+ characters) for `/admin`
   - Optional: `RESEND_API_KEY` and `OWNER_EMAIL` to get an email for every paid order and enquiry
4. **Webhook.** In Paystack, set the webhook URL to `https://<your-site>/api/paystack/webhook`.
5. **Set your real data** at `https://<your-site>/admin` (username `admin`):
   - **Products:** the starter products and prices are placeholders. Edit them, add photos (any `https://` image link), and set each product's wholesale minimum.
   - **Delivery fees:** the starter fees (₦1,500 Epe / ₦4,000 Lagos / ₦8,000 outside Lagos) are placeholders too.
6. **Test a purchase** with Paystack's test card (shown in Paystack's docs). The order should show as *paid* in `/admin/orders`.
7. **Go live:** swap `PAYSTACK_SECRET_KEY` for the live `sk_live_…` key, set the live webhook URL in Paystack, and connect your domain in Render.
8. **Before launch, review** the privacy policy and terms text in `src/pages/Legal.tsx`. They're a plain-language starting point, not legal advice.

## Day to day

- **New paid order:** you get an email (if Resend is set up), and Paystack also emails you each payment. Open the order in `/admin/orders`, call the customer, and mark it *dispatched* and then *delivered*.
- **Refunds** are done in the Paystack dashboard. Marking an order *cancelled* in admin doesn't move money.
- **Pending orders** are customers who started checkout but didn't pay. They aren't sales.
- **Hide a product** by unticking *Show on the website*. Order history keeps the name and price each customer paid.

## Developing locally

Needs Node.js 22.18 or newer, and a PostgreSQL database (a free Neon branch works).

```bash
npm install
cp .env.example .env      # fill in DATABASE_URL, PAYSTACK_SECRET_KEY (test key), ADMIN_PASSWORD
npm run dev:server        # API + admin on http://localhost:3000
npm run dev               # website with hot reload on http://localhost:5173 (talks to the server above)
npm test                  # pricing, validation and Paystack-signature tests
npm run build && npm start  # production-style: one server on :3000
```

Paystack can't reach `localhost`, so locally payments are confirmed when the customer returns to `/order`, which checks with Paystack directly. That works with test keys.

## Security notes

- Prices, wholesale rules and delivery fees are always recalculated on the server. The browser only sends product IDs and quantities.
- The webhook is accepted only with a valid Paystack signature, and payments must match the order total to the kobo.
- `/admin` uses a password and rejects form submissions from other websites. Use a strong `ADMIN_PASSWORD`, and only open the admin over `https`.
- Public endpoints are rate-limited per visitor. The enquiry form has a hidden spam trap.
