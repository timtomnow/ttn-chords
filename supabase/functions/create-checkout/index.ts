// Edge Function: start a Square checkout for a bundle (dynamic, per-user).
//
// Why this exists: a single shared payment link can't tell the webhook WHO
// bought it. Instead we mint a fresh Square payment link per click with the
// buyer's user_id + the bundle_id baked into the order metadata. The
// square-webhook then reads those back and grants the entitlement to exactly the
// right account — no email guessing, no manual reconciliation.
//
// Auth: runs with verify_jwt = true. The caller's identity comes from their JWT
// (the Authorization header supabase.functions.invoke attaches), NOT the body —
// a user can only ever buy for themselves. Price comes from the DB, never the
// client, so the amount can't be tampered with.
//
// Secrets (Edge Function secrets, never the repo):
//   SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID, SQUARE_ENVIRONMENT (sandbox|production)
//   SQUARE_VERSION (optional — pins the Square API version)
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (auto-provided)

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function squareBaseUrl(): string {
  return Deno.env.get('SQUARE_ENVIRONMENT') === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const squareToken = Deno.env.get('SQUARE_ACCESS_TOKEN');
  const locationId = Deno.env.get('SQUARE_LOCATION_ID');
  if (!squareToken || !locationId) {
    return json({ error: 'Checkout is not configured' }, 500);
  }

  // Who is calling?
  const authHeader = req.headers.get('Authorization') ?? '';
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userErr,
  } = await caller.auth.getUser();
  if (userErr || !user) return json({ error: 'Not authenticated' }, 401);

  let bundleId: unknown;
  let redirectTo: unknown;
  try {
    ({ bundleId, redirectTo } = await req.json());
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }
  if (typeof bundleId !== 'string' || bundleId.trim() === '') {
    return json({ error: 'A bundle is required' }, 400);
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Price + title come from the DB (never the client).
  const { data: bundle, error: bundleErr } = await admin
    .from('bundles')
    .select('id, title, price_cents, is_active')
    .eq('id', bundleId)
    .maybeSingle();
  if (bundleErr) return json({ error: 'Could not load bundle' }, 500);
  if (!bundle || !bundle.is_active) return json({ error: 'Bundle not available' }, 404);
  if (!bundle.price_cents || bundle.price_cents <= 0) {
    return json({ error: 'This bundle is not for sale' }, 400);
  }

  // Already owned? Don't let them pay twice.
  const { data: existing } = await admin
    .from('entitlements')
    .select('id')
    .eq('user_id', user.id)
    .eq('bundle_id', bundleId)
    .maybeSingle();
  if (existing) return json({ error: 'You already own this bundle' }, 409);

  // Mint a Square payment link carrying user_id + bundle_id in order metadata.
  const squareHeaders: Record<string, string> = {
    Authorization: `Bearer ${squareToken}`,
    'Content-Type': 'application/json',
  };
  const version = Deno.env.get('SQUARE_VERSION');
  if (version) squareHeaders['Square-Version'] = version;

  const body = {
    idempotency_key: crypto.randomUUID(),
    order: {
      location_id: locationId,
      reference_id: bundleId,
      line_items: [
        {
          name: bundle.title,
          quantity: '1',
          base_price_money: { amount: bundle.price_cents, currency: 'CAD' },
        },
      ],
      metadata: { user_id: user.id, bundle_id: bundleId },
    },
    checkout_options:
      typeof redirectTo === 'string' && redirectTo
        ? { redirect_url: redirectTo }
        : undefined,
  };

  const resp = await fetch(`${squareBaseUrl()}/v2/online-checkout/payment-links`, {
    method: 'POST',
    headers: squareHeaders,
    body: JSON.stringify(body),
  });
  const result = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error('[create-checkout] Square error', resp.status, JSON.stringify(result));
    return json({ error: 'Could not start checkout' }, 502);
  }
  const checkoutUrl = result?.payment_link?.url;
  if (!checkoutUrl) return json({ error: 'Could not start checkout' }, 502);

  return json({ url: checkoutUrl });
});
