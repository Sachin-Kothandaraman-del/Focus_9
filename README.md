# PROSAFE × EGA — Production Full-Stack Ordering Platform

Mobile app (Google Play-ready) + Website + Middleware + Supabase database/auth + ERPNext integration.
Built from your SRS documents — now upgraded to **Mobile App SRS2 (25-08-26)** with the real master
data from the *Data List* Excel workbooks (Master List, Price List PL1–PL3, Store Inventory,
Groups & Categories).

```
┌──────────────────┐
│  Mobile App       │──┐
│  (Expo / React    │  │   HTTPS/JSON      ┌──────────────────┐        ┌───────────────────────┐
│   Native)         │  ├────────────────►  │  Middleware       │ ────►  │  Supabase              │
└──────────────────┘  │   JWT auth        │  (Node/Express)   │        │  (Postgres + Auth)     │
┌──────────────────┐  │                   │  business rules   │        └───────────────────────┘
│  Website          │──┘                   │                   │ ────►  ERPNext (live) /
│  (React + Vite)   │                      └──────────────────┘        Focus9 (stub w/ TODOs)
└──────────────────┘
   web/                                       middleware/
```

**Features (SRS2, 25-08-26)**: e-mail/password **account creation**, **login**, **account deletion** (Play Store requirement) · self-signup with **admin activation** (customer, department, location, **multiple price lists** = multiple shopping tabs, From/To stores) · full masters incl. **Contracts, Divisions, Stores (Main + Reservation), Groups & Categories** with an admin Masters editor · price lists with **validity dates + delivery period** and size-variant lines sharing one allocation · shopping screen header with **Total Allocated / Total Used Amounts** · live **Main-store stock** on every item · server-side carts that **reserve stock on picking with a 10-minute window** (expiry releases stock) · within-limit → Order Cart, over-limit → Approval Cart (both debit Used Qty) · order placement **stock-transfers reserved qtys Main → Reservation store** (Issue + Receipt vouchers) · **delivery-date rules** (order date + delivery period / "DOD to be advised" / partial-stock line split) · **3-day approval window** with auto-cancel · **Re-save** (single + bulk) to fill DOD lines when stock arrives, with employee notifications · DOs issued **from the Reservation store** with employee acknowledgement (Receipt Voucher process removed) · **returns within 3 days of receipt** with store **Return Confirmation** crediting the price list + Main store and raising a **Credit Note** · balance cancellation by Stores · DO-consolidated invoicing · per-store **inventory screen** with manual adjustments & transfers · **four roles** — see below.

**Roles**
| Role | Can do | Cannot do |
|---|---|---|
| `employee` | Shopping list, carts, own orders, DO acknowledgement, returns, My Limits | Anything in the Store Module or administration |
| `approver` | EGA client approval (approve line-wise / reject), view all orders & masters | Fulfilment, inventory, administration |
| `store` | **Store Module** — Fulfilment (Delivery Notes, Re-save single/bulk, Return Confirmation, DO consolidation & invoicing, cancel undelivered balance), Inventory (stock per store, adjustments, Issue/Receipt transfers), all orders, read-only masters | Create/edit users, create/edit/delete masters, delete accounts |
| `admin` | Everything the `store` role can do **plus** administration: Users (roles, shopping profiles, activation) and Masters (all master data incl. the price-list editor) | — (admin accounts are protected from editing/deletion) |

Promote a signed-up user to `store` or `admin` in **Users → Set up → Role**. Promoting to `admin` is permanent; the `store` role can be changed or deactivated at any time.

**Two run modes** (auto-detected): leave Supabase keys empty → **local demo mode** (JSON DB, demo logins, password `prosafe1`); fill them in → **production mode** (Supabase Postgres + Supabase Auth).

---

## 1. Set up Supabase (production database + auth)

1. Create a free project at https://supabase.com
2. SQL Editor → paste & run `middleware/supabase/schema.sql`, then `middleware/supabase/seed.sql`
3. **Authentication → Providers → Email**: for the smoothest start, turn **off** "Confirm email" (turn it back on later — the apps handle both).
4. **Settings → API**: copy Project URL, `anon` key, `service_role` key.

## 2. Configure & run the middleware

```bash
cd middleware
npm install
copy .env.example .env
```
Edit `.env`:
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — from step 1 (or leave empty for demo mode)
- `ADMIN_EMAILS=sachdukr@gmail.com` — sign up with this e-mail to become the **active admin automatically** (bootstrap)
- `JWT_SECRET` — any long random string

```bash
npm start          # → http://localhost:4000  (log line shows storage/auth/erp modes)
```

**Demo-mode logins** (password `prosafe1`): ahmed.m@dubal.ae · ravi.k@emal.ae · sara.k@twa.ae (employees) · m.hassan@ega.ae (approver) · storekeeper@prosafe.ae (**store**) · stores@prosafe.ae (admin). In Supabase mode there are no demo users — everyone signs up.

## 3. Run the website

```bash
cd web
npm install
copy .env.example .env      # VITE_API_URL=http://localhost:4000
npm run dev                 # → http://localhost:5173
```
Deploy: `npm run build` → upload `dist/` to Vercel/Netlify/any static host; set `VITE_API_URL` to your public middleware URL at build time.

## 4. Run the mobile app

```bash
cd mobile
npm install
npx expo start              # scan QR with Expo Go
```
Set the middleware URL in `mobile/src/config.js` (LAN IP for a physical phone, HTTPS URL for production).

## 5. First-run walkthrough

1. Open web or mobile → **Create Account** with your `ADMIN_EMAILS` address → you're instantly an active admin.
2. Colleagues sign up → they see "awaiting activation".
3. Admin (web → **Users**): assign role/company/department/price list → **Activate**.
4. Employee shops → orders within limits create the ERP SO instantly; over-limit/restricted items go to the **Approval** bucket.
5. Approver approves (SO created, approved-qty list raised) or rejects.
6. Admin creates Delivery Notes → employee acknowledges receipt → returns credit the allocation → admin consolidates DOs → invoice to EGA.
7. Anyone can delete their own account from **Profile** (admin can also delete users).

## 6. ERPNext integration (live ERP)

In `middleware/.env`:
```
ERP_PROVIDER=erpnext
ERPNEXT_URL=https://your-site.erpnext.com
ERPNEXT_API_KEY=…
ERPNEXT_API_SECRET=…
```
Prerequisites on the ERPNext site: an API user with key/secret, **items with the same item codes** (HPHTPE0001, …), **customers with the same names** (Dubai Aluminum, Emirates Aluminum) and **warehouses named after the store codes** (EGAMS, EGADR, EGAER) as the seed masters. Then real Sales Orders, Delivery Notes, Returns and Sales Invoices are created in ERPNext (also mirrored into Supabase for in-app display). Focus9: keep `ERP_PROVIDER=focus9-stub`; replace the marked TODOs in `middleware/erp/focus9.js` when Focus Softnet provides API docs.

## 7. Publish to Google Play

1. Deploy the middleware to a public **HTTPS** host (Render / Railway / a VPS). Put that URL in `mobile/src/config.js`.
2. ```bash
   cd mobile
   npm install -g eas-cli
   eas login
   eas init
   eas build --platform android --profile production
   ```
3. Play Console (https://play.google.com/console, $25 one-time): create the app, upload the `.aab`, complete the **Data safety** form:
   - Data collected: name, e-mail, phone (account management)
   - **Account deletion**: the app has in-app deletion (Profile → Delete my account) — Google requires this and it's already implemented. You must also provide a web deletion URL: your deployed website's profile page qualifies.
4. Internal testing → Production → review (1–3 days).

## Deploying updates (GitHub + Vercel)

Code lives at https://github.com/Sachin-Kothandaraman-del/Focus_9 · web: https://prosafe-ega-web.vercel.app · middleware: https://prosafe-ega-middleware.vercel.app

1. **Migrate the Supabase database to the SRS2 model (one-time, before deploying v3)** —
   Supabase → SQL Editor, run in order: `middleware/supabase/migrate-v2-to-v3.sql` →
   `schema.sql` → `seed.sql`. User accounts are kept; re-assign each employee's price
   lists and stores afterwards in **Users → Set up**.
2. **Push to GitHub**: `git add -A && git commit -m "…" && git push origin main`
   (`.gitignore` keeps `.env*`, `.vercel/`, `node_modules/`, `middleware/data/` out of the repo).
3. **Redeploy Vercel** — either run `vercel --prod` inside `middleware/` and again inside
   `web/` (the folders are already linked to the `prosafe-ega-middleware` / `prosafe-ega-web`
   projects), **or** connect the GitHub repo once in the Vercel dashboard
   (each project → Settings → Git → Connect `Focus_9`, and set **Root Directory** to
   `middleware` resp. `web`) so every push auto-deploys.
4. Vercel env vars (already set from the first deploy — verify after big changes):
   middleware needs `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `JWT_SECRET`, `ADMIN_EMAILS`; web needs `VITE_API_URL=https://prosafe-ega-middleware.vercel.app`.

## Production hardening checklist

HTTPS everywhere (middleware behind nginx/Caddy or a PaaS with TLS) · strong `JWT_SECRET` · keep `service_role` key **only** on the server · re-enable Supabase e-mail confirmation · add rate limiting (`express-rate-limit`) · Supabase automatic backups are on by default · rotate ERPNext API keys periodically · monitor the ERP event log (Fulfilment → API/Event Log) for flagged sync failures.

## Project layout

```
prosafe-app/
├── middleware/                 Node.js business-logic layer (v3 — SRS2 25-08-26)
│   ├── server.js               REST API — auth, orders, approvals, fulfilment, admin
│   ├── auth.js                 signup / login / refresh / account deletion (Supabase Auth or local)
│   ├── store/                  supabase.js (Postgres) · local.js (JSON demo) · seed-data.js
│   ├── erp/                    erpnext.js (live) · focus9.js (stub) · index.js (selector + retry)
│   └── supabase/               schema.sql · seed.sql  (paste into Supabase SQL editor)
├── web/                        React + Vite portal (all roles) → deploy dist/ anywhere
│   └── src/pages/              Auth · Shop · Carts · Orders · Approvals · Fulfilment · Inventory · Masters · Users · Profile (My Limits)
└── mobile/                     Expo React Native app (Android + iOS)
    └── src/screens/            Login/Signup · Shop · Carts · Orders · Detail · Profile(+delete) · Approvals · Fulfilment
```
