# ▶️ RESUME HERE — Phase 5 (Square payments) + Production launch

This is the pick-up point for the ttn-chords cloud refactor. **Phases 1–4 are
done** (auth, user data, commerce read side, admin + access codes). What's left:
**Phase 5 = Square payments**, then **going live on the prod project**.

Read this top-to-bottom when you return. It has four parts:

- **Part 0** — where things stand right now (so you don't repeat work).
- **Part A** — human setup you do before/while Claude builds Phase 5 (Square).
- **Part B** — the prompt to paste into Claude Code to build Phase 5.
- **Part C** — Square testing checklist.
- **Part D** — full production deployment (run everything against the prod
  project, wire the deploy, flip Square to live).

---

## Decisions locked (2026-06-24) — pre-Phase-5 open questions, now settled

These came out of the "Open Decisions" review. They shape the order below.

- **Receipts/notifications:** in-app inbox **now**; emailed receipts **deferred**.
  Added in **Chunk 1** (below): a `notifications` table + inbox UI. The Phase-5
  Square webhook and the `redeem-code` function each write a notification row in
  the same path as the entitlement; admin grants write one client-side.
- **Auth for launch:** **email/password only**. Google/Apple come later — when
  social lands, TEST same-email account-linking before shipping it.
- **ttn-backup / JSON export:** **retire it before launch** (Chunk 1). It only
  ever snapshotted the local Dexie cache, which is misleading now the cloud is
  the source of truth. The export UI is removed; `src/lib/ttnBackup.ts` and the
  adapter contract stay intact per CLAUDE.md (just no UI entry points).
- **Email provider:** **Resend** (custom domain, SPF/DKIM/DMARC, link-tracking
  OFF). Set up for **auth** email in prod (Part D §5); the same API key is what a
  future receipt email would use.
- **Marketing:** no marketing-send path now. Chunk 1 only adds the cheap
  `profiles.marketing_opt_in boolean default false` column (+ a future opt-in
  checkbox) so consent is captured from day one. Account email ≠ consent.

### Build order set by the above
- **Chunk 1 (no external setup needed):** `0006_notifications.sql`
  (`notifications` table + `profiles.marketing_opt_in`), the in-app inbox UI +
  unread badge, and retiring the export/ttn-backup UI.
- **Chunk 2 (needs Square sandbox creds):** Phase 5 per Part B — now amended so
  the webhook also inserts a `notifications` row (purchase + entitlement +
  notification, all idempotent).
- **Chunk 3:** production deploy (Part D), migrations `0001 → 0006`.

---

## Part 0 — Current status (as of pausing)

**Done & committed (Phases 1–4):**
- Supabase client + email/password auth, route guards, `profiles` + `is_admin`.
- User songs/setlists/notes in Supabase (RLS); "import my local data" action.
- Bundles + entitlements + the paid gate; public storefront; bundle detail.
- Admin UI (create bundles, copy songs in, generate access codes, grant by
  email); `redeem-code` Edge Function for access codes.

**Migrations applied to the DEV project (`ttn-chords-dev`):**
`0001_profiles_auth.sql`, `0002_user_content.sql`, `0003_commerce.sql`,
`0004_access_codes.sql` — all in `supabase/migrations/`.

**Confirmed working in dev:**
- [x] All four migrations (0001–0004) applied to `ttn-chords-dev`.
- [x] Admin role bootstrapped; admin UI works (bundles, songs, codes, grants).
- [x] `redeem-code` Edge Function **deployed** and code redemption verified.

> Deploy tip: the **dashboard** Edge Functions editor was the path that worked —
> the local `supabase` CLI hit a macOS keychain "access token not provided" snag
> on `functions deploy`. For Phase 5's `square-webhook`, deploy the same way
> (Dashboard → Edge Functions → Create function → paste the file). IMPORTANT for
> the webhook: turn **Verify JWT OFF** for it (Square can't send a Supabase JWT) —
> there's a toggle when creating/configuring the function in the dashboard.

**Known deferred items (not blockers, but track them):**
- ~~**JSON export / ttn-backup** snapshots the local cache, not cloud data.~~
  **Resolved:** retire the export UI in Chunk 1 (see "Decisions locked").
- **Public song notes** should be limited to teachers/admins, not all users
  (see the toggle in `src/pages/songs/SongNotes.tsx`). Product decision, deferred.
- The **GitHub Pages deploy workflow does NOT yet inject the Supabase env vars** —
  see Part D, this is required or prod ships with no backend configured.

**Project facts you'll need:**
- Dev project ref: `enhehzknoomaozsoelxc` (from the dev URL).
- Prod project is named **`ttn-chords`** (you still need its URL + keys for Part D).
- Frontend deploys to GitHub Pages via `.github/workflows/deploy.yml` on push to
  `main`. `base` = `/ttn-chords/`.

---

## Part A — Human setup for Square (do these around the build)

### Before Claude starts Phase 5
- [ ] Create a **Square developer account**: https://developer.squareup.com/
- [ ] Create an **application**, then open its **Sandbox** credentials. Copy and
      keep private (password manager):
  - **Sandbox Access Token**
  - **Application ID**
  - **Location ID** (Sandbox → Locations)
- [ ] Decide the payment model (tell Claude in the prompt). Default: **Square
      Payment Links / Checkout** — one hosted payment link per bundle, which you
      paste into the bundle's "Square payment link" field (already in the admin
      UI). The webhook confirms payment and grants the entitlement.

### During the build (when Claude reaches the webhook)
- [ ] In Square Dashboard → **Webhooks**, create a subscription pointing at the
      dev Edge Function URL Claude gives you
      (`https://enhehzknoomaozsoelxc.supabase.co/functions/v1/square-webhook`),
      subscribe to the **payment events** Claude specifies (e.g.
      `payment.updated`), and copy the **Webhook Signature Key**.
- [ ] Set the Edge Function **secrets** in Supabase (Settings → Edge Functions,
      or `supabase secrets set`). NEVER in the repo:
  - `SQUARE_ACCESS_TOKEN` = sandbox access token
  - `SQUARE_WEBHOOK_SIGNATURE_KEY` = the webhook signature key
  - `SQUARE_ENVIRONMENT` = `sandbox` (then `production` at launch)
  - (`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.)

> Note: the webhook must be deployed with **JWT verification OFF** (Square can't
> send a Supabase JWT). Claude should add `supabase/config.toml` with
> `[functions.square-webhook] verify_jwt = false`, or you set it at deploy time.
> Security comes from verifying **Square's signature**, not a JWT.

---

## Part B — Prompt to paste into Claude Code for Phase 5

> Run from the repo root. Paste everything in this box.

```
Continue the ttn-chords Supabase cloud refactor. Phases 1–4 are complete and
committed (auth, user data, bundles/entitlements, storefront, admin UI, and the
redeem-code Edge Function). Read CLAUDE.md, plan.md, ttn-chords-supabase-schema.md,
RESUME-HERE.md, and the existing src/ and supabase/ first. Respect the existing
stack and conventions, keep TypeScript strict, and build only Phase 5.

PHASE 5 — SQUARE PAYMENTS (read side already exists; add the money path)
Goal: a user can buy a bundle with Square, and on confirmed payment an
entitlement is granted automatically and idempotently.

Build:
1. A `purchases` table (audit log) per the schema file: id, user_id, bundle_id,
   square_payment_id (UNIQUE), amount_cents, status, created_at. Enable RLS:
   users select their own; admins all; NO user write (writes happen server-side).
   Add it as supabase/migrations/0005_purchases.sql.
2. Per-bundle Square payment links: the admin already stores square_link_url on a
   bundle. On the bundle detail page, when a bundle is not owned and has a
   square_link_url, show a real "Buy" button linking to it (replace the disabled
   placeholder). If a bundle has no link, keep checkout disabled.
3. A `square-webhook` Edge Function (supabase/functions/square-webhook/index.ts)
   that:
   - Verifies Square's webhook signature using SQUARE_WEBHOOK_SIGNATURE_KEY and
     the request URL + raw body (per Square's current docs — confirm the exact
     HMAC scheme live, it has changed over time; flag anything uncertain).
   - Handles the payment-completed event, looks up the Square payment to get
     amount + an idempotency id, maps it to a bundle + user (decide the mapping:
     use the payment link's reference_id / metadata you set when creating links,
     or note clearly how the admin must configure links so the bundle+user are
     recoverable).
   - Inserts a purchases row, an entitlements row (source='purchase'), AND a
     notifications row (type='purchase') for the buyer, using the service-role
     key. All idempotent on square_payment_id (ON CONFLICT DO NOTHING) so
     duplicate webhooks don't double-grant or double-notify. (The notifications
     table + the `redeem-code` notification write ship in Chunk 1, ahead of this.)
   - Rejects bad signatures with 401. Runs with verify_jwt = false; add/update
     supabase/config.toml accordingly.
4. Update the Database types, ttn-chords-supabase-schema.md (note purchases is
   now created), and add purchases to the RLS enable list if needed.
5. Confirm current Square specifics (payment link fields, webhook event names,
   signature verification) against Square's developer docs as you go. Where the
   spec is ambiguous (esp. how to recover which user+bundle a payment is for),
   STOP and ask me rather than guessing.

GUARDRAILS (unchanged from the original brief):
- Service-role key only in Edge Function secrets, never the repo/frontend.
- Keep the JSON export shape + ttn-backup adapter stable.
- After the phase, summarise what changed, what I must configure (run SQL, deploy
  the function, set secrets, create the Square webhook + payment links), and how
  to test it (Part C of RESUME-HERE.md).
- Per CLAUDE.md, do not git commit — write a proposed commit message instead.
```

---

## Part C — Square testing checklist (sandbox)

- [ ] Sandbox purchase via a bundle's payment link → webhook fires → a
      `purchases` row appears → an `entitlements` row (`source='purchase'`)
      appears → the bundle's songs unlock for that user.
- [ ] A webhook with a **bad signature** is rejected (401), no rows written.
- [ ] A **duplicate** webhook (same `square_payment_id`) does **not** create a
      second entitlement or purchase (idempotent).
- [ ] A logged-out visitor can still see active bundles; the Buy button sends
      them to sign in (or to Square, per your design).
- [ ] Re-run the Phase 1–4 RLS checks (two users A/B) to confirm nothing
      regressed: A can't read B's purchases/entitlements; A can't read
      access_codes; A can't self-insert an entitlement or purchase.

---

## Part D — Production deployment (going live)

Do this once Phase 5 works in dev. Target = the **`ttn-chords`** (prod) project.

### 1. Prod database
- [ ] In the **prod** project's SQL editor, run **all** migrations in order:
      `0001 → 0002 → 0003 → 0004 → 0005 → 0006`.
- [ ] Bootstrap your admin in prod (sign up first, then the disable-trigger /
      `update profiles set role='admin'` / enable-trigger block from
      `0001_profiles_auth.sql`).
- [ ] Recreate any bundles/songs/codes you want in prod (dev data does NOT carry
      over). Or build an export/import path if there's a lot.

### 2. Prod Edge Functions
- [ ] `supabase link --project-ref <PROD_REF>` then
      `supabase functions deploy redeem-code` and
      `supabase functions deploy square-webhook` against prod.
- [ ] Set prod Edge Function secrets: `SQUARE_ACCESS_TOKEN` (LIVE token),
      `SQUARE_WEBHOOK_SIGNATURE_KEY` (prod webhook), `SQUARE_ENVIRONMENT=production`.

### 3. Frontend env on the deploy (REQUIRED — currently missing)
The GitHub Pages workflow (`.github/workflows/deploy.yml`) builds with **no**
Supabase env, so prod would ship the "not configured" screen. Fix it:
- [ ] Add GitHub repo secrets (Settings → Secrets and variables → Actions):
      `VITE_SUPABASE_URL` = prod URL, `VITE_SUPABASE_ANON_KEY` = prod anon key.
      (Anon/publishable key only — never the secret key.)
- [ ] Edit `deploy.yml` so the build step receives them, e.g.:
      ```yaml
      - name: Check and build
        run: npm run build        # (or keep `npm run check`)
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
      ```
      Note: `npm run check` runs tests/build; ensure the env is present for the
      build it performs. Putting `env:` on the step covers all its commands.

### 4. Square live
- [ ] Switch the Square app from **Sandbox** to **Production**; create LIVE
      payment links per bundle and paste them into each bundle's admin field.
- [ ] Create a **production webhook** pointing at the prod function URL
      (`https://<PROD_REF>.supabase.co/functions/v1/square-webhook`) and update
      `SQUARE_WEBHOOK_SIGNATURE_KEY` to the prod key.

### 5. Auth hardening for prod
- [ ] Turn **Confirm email ON** in the prod project (it's off in dev for testing).
- [ ] Configure **custom SMTP** (Resend/SendGrid/etc.) so confirmation emails
      aren't throttled by Supabase's built-in sender.
- [ ] Set the prod **Site URL / redirect URLs** in Supabase Auth to your GitHub
      Pages URL (needed for email links and any future social login).

### 6. Pre-announce verification
- [ ] Run **Part C** end-to-end against prod.
- [ ] One **real-money** Square live purchase (small amount) before announcing.
- [ ] Grep the built site for secrets: the deployed bundle must contain the anon
      key only — never `sb_secret_…` / service-role.

---

### Reminders that no setup removes
- A paying user can still copy content they bought — RLS protects against
  non-buyers/outsiders, not a buyer extracting their own purchase.
- "Safe" = RLS on + correct + tested. The Part C testing IS the security review.
