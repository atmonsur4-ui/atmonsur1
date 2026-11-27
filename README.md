# Atmonsur Store

Online store for Atmonsur Multiglobal Resources Ltd: retail and wholesale ordering, online payment with PalmPay, and a password-protected admin area for orders, products, delivery fees and enquiries.

## How it fits together

| Part | What it is |
|---|---|
| Website (`src/`) | React + Vite + Tailwind. Built into `dist/` by `npm run build`. |
| Server (`server/src/`) | One small Node.js server ([Hono](https://hono.dev)). It serves the website, the `/api` the website uses, PalmPay payment notifications and the `/admin` pages. |
| Database | PostgreSQL. Tables are created automatically on first start, with starter products. |
| Payments | [PalmPay Checkout](https://docs.palmpay.com/en/pay-ins-palmpay-checkout-instruction): customers pay on PalmPay's secure page (PalmPay app or bank transfer). Payment details never touch this server. |
| Product pages | Each product has its own page at `/product/<number>-<name>`, with retail and wholesale prices, a quantity picker, a description and related products. Shared links show the product's name, description and photo in WhatsApp, Facebook and Google. |
| Customer accounts | Optional sign-up for customers: order history with delivery status, “Order again”, saved delivery details. Guests can still check out. |
| Emails | [Resend](https://resend.com) emails you each paid order and enquiry, and sends customers their email-confirmation and password-reset links. |

**Hosting:** the site needs its server running, not just the website files. Two tested setups:
- **Vercel** (see *Deploying on Vercel* below): the website on Vercel's CDN and the server as one Vercel Function, using `vercel.json` and `npm run build:vercel`.
- **[Render](https://render.com)** web service, using `render.yaml`. Use the Starter plan (about $7/month) for a live store: the free plan sleeps after 15 minutes idle.

Either way, use [Neon](https://neon.tech) (free tier) for PostgreSQL.

How a purchase works: the customer fills the cart → checkout picks a delivery option → the server re-prices everything from the database and creates a *pending* order → PalmPay's checkout page → back to `/order`. The order is marked *paid* only when PalmPay confirms it (a signed payment notification, or a direct status check with PalmPay), with status *success* and exactly the right amount.

## Go live: step by step

1. **Database.** Create a free project at neon.tech and copy its connection string (`postgres://…?sslmode=require`).
2. **PalmPay merchant account.** PalmPay sets this up with you: contact PalmPay business development to apply for **PalmPay Checkout** and sign the agreement ([their onboarding guide](https://docs.palmpay.com/en/merchant-entry-guidelines-guidelines-for-merchant-access-merchant-platform-parameter-configuration)). Then:
   - **Make your key pair.** This is your private key plus a public key. Any RSA tool works, e.g. `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out palmpay-private.pem` then `openssl pkey -in palmpay-private.pem -pubout -out palmpay-public.pem`. Keep the private key secret. Never upload it, email it or commit it.
   - **In the PalmPay merchant portal:** upload your **public** key, and copy your **App ID** (starts with `L`) and **PalmPay's platform public key**.
   - **For production,** add your server's outgoing IP address to PalmPay's IP whitelist. Render lists it under your service's *Connect → Outbound*.
3. **Deploy.** Put this folder in a GitHub repository. In Render choose *New → Blueprint*, pick the repository (it reads `render.yaml`), and fill in the environment variables it asks for:
   - `DATABASE_URL`: the Neon connection string
   - `SITE_URL`: your site address with no trailing slash, e.g. `https://atmonsur-store.onrender.com` (later your own domain)
   - `PALMPAY_ENV`: `sandbox` for now
   - `PALMPAY_APP_ID`, `PALMPAY_PRIVATE_KEY` (your private key: the base64 text or the whole PEM file) and `PALMPAY_PUBLIC_KEY` (PalmPay's platform public key)
   - `ADMIN_PASSWORD`: a long password (12+ characters) for `/admin`
   - `RESEND_API_KEY`, `OWNER_EMAIL` and `NOTIFY_FROM`: emails for you (new orders and enquiries) and for customers (confirm email, reset password). **Without these, customers can't reset forgotten passwords.** To email customers, verify your domain in Resend and set `NOTIFY_FROM` to an address on it, e.g. `Atmonsur Store <orders@atmonsur.com>`.
4. **Check the connection.** In Render's *Shell* tab (or locally with the same values in `.env`) run `npm run palmpay:check`. It creates a ₦1 test order and says either *Keys and signing are correct* or what's wrong (wrong key, App ID, IP whitelist). Nothing is charged. There's no webhook to configure: every order tells PalmPay to notify `https://<your-site>/api/palmpay/notify`.
5. **Set your real data** at `https://<your-site>/admin` (username `admin`):
   - **Products:** the starter products and prices are placeholders. Edit them, add photos (any `https://` image link), set each product's wholesale minimum, and write a short description for its product page.
   - **Delivery fees:** the starter fees (₦1,500 Epe / ₦4,000 Lagos / ₦8,000 outside Lagos) are placeholders too.
6. **Test a purchase** in the sandbox (PalmPay's [test tools page](https://docs.palmpay.com/en/test-tools-test-account-secret-key) explains sandbox accounts). The order should show as *paid* in `/admin/orders`.
7. **Go live:** set `PALMPAY_ENV=production` with your production App ID and keys, make sure the server IP is whitelisted, run `npm run palmpay:check` once more, and connect your domain in Render. Do one real low-value purchase and refund it.
8. **Tell Google about the site:** add it in [Google Search Console](https://search.google.com/search-console) and submit `https://<your-site>/sitemap.xml`. That file lists every product and updates itself.
9. **Before launch, review** the privacy policy and terms text in `src/pages/Legal.tsx`. They're a plain-language starting point, not legal advice.

## Deploying on Vercel

`vercel.json` tells Vercel to run `npm run build:vercel`. That builds the website and packs the server into one Vercel Function (`scripts/build-vercel.mjs`, using Vercel's [Build Output API](https://vercel.com/docs/build-output-api/v3)). Images and code files come from Vercel's CDN; pages, `/api`, `/admin` and payment notifications go to the function.

1. **Project settings → Build and Deployment:** set *Framework Preset* to **Other**, and turn off any *Output Directory* override (e.g. `dist`). Otherwise Vercel serves only the website files and products never load, which is what an empty "Best sellers" section means.
2. **Database:** in your Vercel project, *Storage → Create Database → Neon*. This sets `DATABASE_URL` for you. Use the **pooled** connection string (its host contains `-pooler`), because many function instances may connect at once.
3. **Environment variables** (*Settings → Environment Variables*, Production): `SITE_URL` (e.g. `https://atmonsur.vercel.app`, no trailing slash), `ADMIN_PASSWORD`, `PALMPAY_ENV`, `PALMPAY_APP_ID`, `PALMPAY_PRIVATE_KEY`, `PALMPAY_PUBLIC_KEY`, `RESEND_API_KEY`, `OWNER_EMAIL`, `NOTIFY_FROM`, and `NODE_ENV=production`. **Redeploy** after changing them.
4. **Check:** `https://<your-site>/api/catalogue` should show your products as JSON, and refreshing `/shop` should not give a 404.
5. **PalmPay IP whitelist (production only):** PalmPay only accepts production requests from whitelisted IP addresses, and Vercel functions don't have fixed outgoing IPs unless you add Vercel's paid *Static IPs* feature. Without it, use the sandbox on Vercel, and either add Static IPs or host on Render (which lists fixed outgoing IPs) before switching `PALMPAY_ENV` to `production`. Confirm with `npm run palmpay:check`.

The request rate limits are counted per function instance on Vercel, so they're looser there than on a single Render server.

## Day to day

- **New paid order:** you get an email (if Resend is set up), and every payment also shows in your PalmPay merchant portal. Open the order in `/admin/orders`, call the customer, and mark it *dispatched* and then *delivered*.
- **Refunds** are done in the PalmPay merchant portal. Marking an order *cancelled* in admin doesn't move money.
- **Pending orders** are customers who started checkout but didn't pay. They aren't sales.
- **Share a product:** copy its page address from the browser. WhatsApp shows its name, description and photo (or the store image if it has no photo). Renaming a product later doesn't break links already shared.
- **Hide a product** by unticking *Show on the website*. Order history keeps the name and price each customer paid.
- **Customers** (`/admin/customers`) lists accounts with paid order counts and totals. Order pages show whether an order came from an account or a guest. You never see or set customer passwords: customers reset their own from the login page.
- **Closing an account** on request: delete the customer's row in the `customers` table (their past orders stay, unlinked).

## Developing locally

Needs Node.js 22.18 or newer, and a PostgreSQL database (a free Neon branch works).

```bash
npm install
cp .env.example .env      # fill in DATABASE_URL, PALMPAY_* (sandbox), ADMIN_PASSWORD
npm run dev:server        # API + admin on http://localhost:3000
npm run dev               # website with hot reload on http://localhost:5173 (talks to the server above)
npm test                  # pricing, validation, password hashing and PalmPay-signature tests
npm run palmpay:check     # proves your PalmPay keys and signing work (creates a ₦1 test order)
npm run build && npm start  # production-style: one server on :3000
```

PalmPay can't reach `localhost`, so locally payments are confirmed when the customer returns to `/order`, which checks the order status with PalmPay directly.

Without `RESEND_API_KEY` (and when `NODE_ENV` isn't `production`), emails such as confirm-email and reset-password links are printed in the server log instead, so you can test them.

## About the PalmPay integration

It follows PalmPay's documentation ([signature method](https://docs.palmpay.com/en/basics-of-access-signature-method), [create order](https://docs.palmpay.com/en/pay-ins-palmpay-checkout-create-order), [query order](https://docs.palmpay.com/en/pay-ins-palmpay-checkout-query-order-result), [payment notification](https://docs.palmpay.com/en/pay-ins-common-apis-payment-result-notify)). Their docs only include Java samples and leave two details open, so **run `npm run palmpay:check` with your real sandbox keys before going live**:
- The `Signature` header is built as the docs' steps describe: an RSA (SHA1withRSA) signature of the uppercase MD5 of the sorted fields, in base64. One example in the docs shows a shorter value. If the check reports *signature rejected* even though the keys match, send PalmPay support the check's output.
- Keys are read as the bare base64 text PalmPay uses (PKCS#8 private, X.509 public), or as PEM files.

The signing string is unit-tested against the worked example in PalmPay's docs.

## Security notes

- Prices, wholesale rules and delivery fees are always recalculated on the server. The browser only sends product IDs and quantities.
- PalmPay payment notifications are accepted only with a valid signature from PalmPay's public key. Requests to PalmPay are signed with your private key. An order counts as paid only with PalmPay status *success* (2) and the exact order total in kobo; a mismatch is emailed to you instead.
- `/admin` uses a password and rejects form submissions from other websites. Use a strong `ADMIN_PASSWORD`, and only open the admin over `https`.
- Public endpoints are rate-limited per visitor. The enquiry form has a hidden spam trap.
- **Accounts:** passwords are hashed with scrypt and never stored. Login uses an httpOnly, SameSite cookie, and only a hash of its value is kept in the database. API writes must be JSON, which blocks cross-site form attacks. Login has a per-account lockout (8 tries per 15 minutes) and the same error message whether or not the email exists. Reset links last 1 hour, work once, and sign out every other device.
- **Guest orders join an account only after the customer confirms that email address**, so nobody can see someone else's orders by signing up with their email.
