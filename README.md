# PROSAFE × EGA — End-to-End Ordering App

A production codebase built from your SRS (Mobile App SRS1 08-07-26), system-requirement, security and flow-chart documents.

```
┌─────────────────┐      HTTPS/JSON       ┌──────────────────┐      REST API       ┌─────────────┐
│  Mobile App      │  ───────────────►    │  Middleware       │  ───────────────►  │  ERP         │
│  (Expo / React   │   JWT auth           │  (Node.js/Express)│   adapter layer    │  Focus9 stub │
│   Native)        │  ◄───────────────    │  business rules   │  ◄───────────────  │  or ERPNext  │
└─────────────────┘                       └──────────────────┘                     └─────────────┘
     mobile/                                   middleware/
```

**What's implemented** (full SRS coverage): masters (customers, employees, departments, items, price lists 1–4, locations, UOM) · shopping restricted to the employee's approved price list with group/category browsing · allocated-qty checks · Order Cart vs Approval Cart · order screen with system running numbers (OR1001, lines OR1001/001…) · EGA client approval (approve = SO created + approved qty list raised; reject = Reject bucket) · 15-minute cancel window · Delivery Note creation · receipt acknowledgement (partial/full, updates Received/Balance) · material returns crediting the allocation · DO consolidation → invoice to EGA · order buckets · role-based logins (employee / approver / admin) · JWT auth, PIN login, server-side validation of every price and limit.

---

## 1. Run the middleware (backend)

Requires [Node.js 18+](https://nodejs.org). In a terminal:

```bash
cd middleware
npm install
copy .env.example .env        # (Windows)  — edit JWT_SECRET
npm start
```

Server runs at `http://localhost:4000`. Data persists in `middleware/data/db.json` (delete it to reset the demo).

Demo logins: **E1001/1111**, **E1002/2222**, **E1003/3333** (employees) · **A2001/4444** (EGA approver) · **S3001/5555** (PROSAFE admin).

### Switching ERP
- Default: `ERP_PROVIDER=focus9-stub` — fully working simulation; swap in real calls in `middleware/erp/focus9.js` once Focus Softnet provides API docs (TODOs are marked).
- Live ERPNext: set `ERP_PROVIDER=erpnext` plus `ERPNEXT_URL`, `ERPNEXT_API_KEY`, `ERPNEXT_API_SECRET` in `.env`. Create the same item codes and customer names in ERPNext first. Sales Orders, Delivery Notes, Returns and Invoices are then created in the real ERP.

## 2. Run the mobile app (development)

Requires Node.js and the **Expo Go** app ([Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent)) on your phone.

```bash
cd mobile
npm install
```

Edit `mobile/src/config.js` → set `API_URL`:
- Android emulator: `http://10.0.2.2:4000`
- Physical phone on the same Wi-Fi: `http://YOUR-PC-IP:4000` (find it with `ipconfig`)

```bash
npx expo start
```

Scan the QR code with Expo Go. If you see dependency version warnings, run `npx expo install --fix`.

## 3. Publish to Google Play

The app builds in Expo's cloud — no Android Studio needed.

**One-time setup**
1. Create a free account at https://expo.dev
2. Create a **Google Play Console** developer account at https://play.google.com/console ($25 one-time fee)
3. Deploy the middleware to a public HTTPS server (e.g. a small VPS, Render, Railway, or Azure) and put that URL in `mobile/src/config.js` — Play Store apps must use HTTPS, not a LAN IP.

**Build the release bundle**
```bash
cd mobile
npm install -g eas-cli
eas login
eas init            # links the project, fills in projectId automatically
eas build --platform android --profile production
```
EAS builds a signed `.aab` in the cloud (~15 min) and gives you a download link. For a quick installable test APK instead: `eas build -p android --profile preview`.

**Upload to Play Console**
1. Play Console → **Create app** → name "PROSAFE EGA Orders", type App, free
2. Complete the required declarations (privacy policy URL, data safety form, content rating)
3. **Testing → Internal testing → Create release** → upload the `.aab` → add tester emails → roll out
4. After testing, promote to **Production** → Google review (usually 1–3 days) → live

Later updates: bump nothing manually — `eas build` auto-increments the version, then upload the new `.aab` as a new release. `eas submit -p android` can push builds to Play automatically once the first release is live.

## Before real go-live (recommended hardening)

Per your security document: replace demo PINs with real credential management + OTP/MFA · move the JSON datastore to PostgreSQL/MySQL · serve middleware behind HTTPS (nginx/Caddy + Let's Encrypt) · set a strong `JWT_SECRET` · add rate limiting (`express-rate-limit`) · pin certificates in the app · confirm Focus9 API licensing with Focus Softnet (per your Licenses doc, app users don't consume ERP user licenses — the integration user does).

## Project layout

```
prosafe-app/
├── middleware/            Node.js business-logic layer
│   ├── server.js          REST API + all business rules
│   ├── db.js              datastore + seed masters (per SRS)
│   └── erp/               focus9.js (stub) · erpnext.js (live) · index.js (selector/retry)
└── mobile/                Expo React Native app (Android + iOS)
    ├── App.js             navigation, role-based tabs
    ├── app.json           app name, com.prosafe.egaorders package id
    ├── eas.json           cloud build profiles (preview APK / production AAB)
    └── src/screens/       Login · Shop · Carts · Orders · OrderDetail · Profile · Approvals · Fulfilment
```
