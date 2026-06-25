# ▶️ RESUME HERE — Production launch (Part D)

> ## 🟢 START HERE NEXT: Part D — Production deployment
> **Phases 1–4 + the inbox (Chunk 1) + Phase 5 Square (Chunk 2, CAD) are all
> built AND verified working in the dev sandbox** — a real sandbox purchase
> granted the entitlement, unlocked the songs, and dropped an inbox notification.
> Everything below Part C is history/reference; **the remaining work is Part D
> (going live).** Jump there.
>
> **First three things to do in the next session (the launch blockers):**
> 1. **Add the two GitHub repo secrets** `VITE_SUPABASE_URL` /
>    `VITE_SUPABASE_ANON_KEY` (PROD values). The `deploy.yml` wiring is already
>    done — but with no secrets, the live site shows "not configured". (Part D §3)
> 2. **Set up Resend (custom SMTP) + turn Confirm-email ON in prod**, or real
>    signups can't get confirmation/reset emails. (Part D §5, + "Decisions locked")
> 3. **Run migrations `0001 → 0006` on the PROD project**, deploy the 3 Edge
>    Functions to prod, then flip Square to LIVE (live token + location + prod
>    webhook). (Part D §1, §2, §4)
>
> Then re-run **Part C end-to-end against prod** + one small **real-money**
> purchase before announcing. Also still uncommitted: this session's work (see the
> proposed commit in chat) — commit it first.

This is the pick-up point for the ttn-chords cloud refactor.

Read this top-to-bottom when you return. It has these parts:

- **Part 0** — where things stand right now (so you don't repeat work).
- **Part A** — Square setup + the Phase 5 activation steps (DONE in dev).
- **Part B** — the (already-executed) Phase 5 build prompt, kept for reference.
- **Part C** — Square testing checklist (passed in dev; re-run against prod).
- **Part D** — 🟢 **full production deployment — this is what's left.**

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
- **Payment attribution (the fork the Phase 5 brief flagged):** **dynamic
  per-user checkout.** "Buy" calls a `create-checkout` Edge Function that mints a
  Square payment link with the buyer's `user_id` + `bundle_id` in the order
  metadata; the webhook reads them straight back — no buyer-email guessing, no
  manual reconciliation. Consequence: `bundles.square_link_url` is **unused** by
  the buy flow (kept in the schema for reference); admins do NOT paste links.

### Build order set by the above
- **Chunk 1 — ✅ DONE & verified in dev:** `0006_notifications.sql`
  (`notifications` + `profiles.marketing_opt_in`), in-app inbox UI + unread badge,
  export/ttn-backup UI retired. Migration run + `redeem-code` redeployed in dev.
- **Chunk 2 — ✅ DONE & verified in dev:** Phase 5 Square. `0005_purchases.sql`,
  `create-checkout` + `square-webhook` Edge Functions, real Buy button, **CAD
  currency**. A real sandbox purchase granted the entitlement, unlocked songs,
  and wrote an inbox notification. Idempotent on `square_payment_id`.
- **Chunk 3 — ⬜ NEXT:** production deploy (Part D), migrations `0001 → 0006`.
- **Not yet committed:** all of Chunk 1 + Chunk 2 + the CAD switch + the
  `deploy.yml` env wiring are in the working tree but uncommitted — commit first.

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
`0004_access_codes.sql`, `0005_purchases.sql`, `0006_notifications.sql` — all in
`supabase/migrations/`.

**Edge Functions deployed to DEV:** `redeem-code` (re-deployed with the
notification write), `create-checkout`, `square-webhook`. Square sandbox secrets
set; webhook subscribed to `payment.updated`; CAD verified end-to-end.

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
- [x] Payment model decided: **dynamic per-user checkout** (built). You do NOT
      paste payment links per bundle — the app mints one per click via the
      `create-checkout` function, with `user_id`+`bundle_id` in the order
      metadata. You just need the **Location ID** below so the function can build
      links. (`bundles.square_link_url` in the admin UI is now unused.)

### Deploy + wire it up (Phase 5 code is built — these are the activation steps)
- [ ] **Run `0005_purchases.sql`** in the dev SQL editor (and `0006` from Chunk 1
      if not already). Order between 0005/0006 doesn't matter.
- [ ] **Deploy two functions** (Dashboard → Edge Functions → Create function →
      paste the file): `create-checkout` (leave **Verify JWT ON**) and
      `square-webhook` (**Verify JWT OFF** — Square can't send a Supabase JWT).
      Also **redeploy `redeem-code`** (its source changed in Chunk 1 to write a
      notification).
- [ ] In Square Dashboard → **Webhooks**, create a subscription pointing at the
      webhook URL (`https://enhehzknoomaozsoelxc.supabase.co/functions/v1/square-webhook`),
      subscribe to **`payment.updated`**, and copy the **Webhook Signature Key**.
- [ ] Set the Edge Function **secrets** in Supabase (Settings → Edge Functions,
      or `supabase secrets set`). NEVER in the repo:
  - `SQUARE_ACCESS_TOKEN` = sandbox access token
  - `SQUARE_LOCATION_ID` = sandbox Location ID  *(needed by create-checkout)*
  - `SQUARE_WEBHOOK_SIGNATURE_KEY` = the webhook signature key
  - `SQUARE_WEBHOOK_URL` = the exact subscription URL above  *(Square signs with
    it; the function falls back to the request URL but set this to be safe)*
  - `SQUARE_ENVIRONMENT` = `sandbox` (then `production` at launch)
  - `SQUARE_VERSION` *(optional)* = pin an API version, e.g. from the Square
    console; if unset the function uses your app's default version.
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

- [ ] Click **Buy** on a priced, unowned bundle → redirected to Square's hosted
      checkout → pay with a sandbox test card → redirected back to the bundle
      page → shortly after, a `purchases` row + an `entitlements` row
      (`source='purchase'`) + a `notifications` row (`type='purchase'`) appear →
      the bundle's songs unlock and the Inbox badge lights up.
- [ ] Clicking **Buy** on a bundle you **already own** is refused by
      `create-checkout` (409 "You already own this bundle"); no link is minted.
- [ ] A webhook with a **bad signature** is rejected (401), no rows written.
- [ ] A **duplicate** webhook (same `square_payment_id`) does **not** create a
      second purchase, entitlement, or notification (idempotent).
- [ ] A logged-out visitor can still see active bundles; the Buy area shows
      **Sign in** (checkout requires a session so the payment can be attributed).
- [ ] Re-run the Phase 1–4 RLS checks (two users A/B) to confirm nothing
      regressed: A can't read B's purchases/entitlements/notifications; A can't
      read access_codes; A can't self-insert an entitlement, purchase, or
      notification.

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
- [ ] `supabase link --project-ref <PROD_REF>` then deploy all three against
      prod: `redeem-code`, `create-checkout`, `square-webhook`. (Or paste each in
      the Dashboard — keep Verify JWT **OFF** for `square-webhook` only.)
- [ ] Set prod Edge Function secrets: `SQUARE_ACCESS_TOKEN` (LIVE token),
      `SQUARE_LOCATION_ID` (LIVE location), `SQUARE_WEBHOOK_SIGNATURE_KEY` (prod
      webhook), `SQUARE_WEBHOOK_URL` (prod function URL),
      `SQUARE_ENVIRONMENT=production`, and `SQUARE_VERSION` if you pinned one.

### 3. Frontend env on the deploy
- [x] **DONE in code:** `deploy.yml`'s "Check and build" step now passes
      `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` through as `env:`.
- [ ] **Still required (human):** add the two GitHub repo secrets so the workflow
      has values to inject (Settings → Secrets and variables → Actions):
      `VITE_SUPABASE_URL` = **prod** URL, `VITE_SUPABASE_ANON_KEY` = **prod** anon
      key. (Anon/publishable key only — NEVER the service-role/secret key.)
      Until these secrets exist, the deployed site still shows "not configured".

### 4. Square live
- [ ] Switch the Square app from **Sandbox** to **Production**; copy the LIVE
      Access Token + LIVE Location ID into the prod secrets above. (No per-bundle
      links to create — checkout links are minted dynamically.)
- [ ] Create a **production webhook** on `payment.updated` pointing at the prod
      function URL (`https://<PROD_REF>.supabase.co/functions/v1/square-webhook`)
      and set `SQUARE_WEBHOOK_SIGNATURE_KEY` + `SQUARE_WEBHOOK_URL` to the prod
      values.

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
