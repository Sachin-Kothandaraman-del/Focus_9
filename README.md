# PROSAFE × EGA — Production Full-Stack Ordering Platform

Mobile app (Google Play-ready) + Website + Middleware + Supabase database/auth + ERPNext integration.
Built from your SRS (Mobile App SRS1 08-07-26), security, licensing and flow-chart documents.

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

**Features**: e-mail/password **account creation**, **login**, **account deletion** (Play Store requirement) · self-signup with **admin activation** (admin assigns company, department, price list) · shopping restricted to approved price lists · allocation limits · Order vs Approval carts · EGA approval workflow · 15-min cancel window · delivery notes · receipt acknowledgement · returns · DO-consolidated invoicing · role-based access (employee / approver / admin) · full masters per SRS.

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

**Demo-mode logins** (password `prosafe1`): ahmed.m@dubal.ae · ravi.k@emal.ae · sara.k@twa.ae · m.hassan@ega.ae (approver) · stores@prosafe.ae (admin). In Supabase mode there are no demo users — everyone signs up.

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
Prerequisites on the ERPNext site: an API user with key/secret, **items with the same item codes** (PPE-SHOE-42, …) and **customers with the same names** (Dubal, Emal, …) as the seed masters. Then real Sales Orders, Delivery Notes, Returns and Sales Invoices are created in ERPNext (also mirrored into Supabase for in-app display). Focus9: keep `ERP_PROVIDER=focus9-stub`; replace the marked TODOs in `middleware/erp/focus9.js` when Focus Softnet provides API docs.

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

## Production hardening checklist

HTTPS everywhere (middleware behind nginx/Caddy or a PaaS with TLS) · strong `JWT_SECRET` · keep `service_role` key **only** on the server · re-enable Supabase e-mail confirmation · add rate limiting (`express-rate-limit`) · Supabase automatic backups are on by default · rotate ERPNext API keys periodically · monitor the ERP event log (Fulfilment → API/Event Log) for flagged sync failures.

## Project layout

```
prosafe-app/
├── middleware/                 Node.js business-logic layer (v2)
│   ├── server.js               REST API — auth, orders, approvals, fulfilment, admin
│   ├── auth.js                 signup / login / refresh / account deletion (Supabase Auth or local)
│   ├── store/                  supabase.js (Postgres) · local.js (JSON demo) · seed-data.js
│   ├── erp/                    erpnext.js (live) · focus9.js (stub) · index.js (selector + retry)
│   └── supabase/               schema.sql · seed.sql  (paste into Supabase SQL editor)
├── web/                        React + Vite portal (all roles) → deploy dist/ anywhere
│   └── src/pages/              Auth · Shop · Carts · Orders · Approvals · Fulfilment · Users · Profile
└── mobile/                     Expo React Native app (Android + iOS)
    └── src/screens/            Login/Signup · Shop · Carts · Orders · Detail · Profile(+delete) · Approvals · Fulfilment
```
