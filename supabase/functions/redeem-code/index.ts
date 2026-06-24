// Edge Function: redeem an access code for a bundle entitlement.
//
// Runs server-side with the SERVICE-ROLE key (bypasses RLS) so the unlock is
// never trusted to the browser. The caller's identity comes from their JWT (the
// Authorization header that supabase.functions.invoke attaches), NOT from the
// request body — a user can only ever grant themselves.
//
// Flow (atomic + idempotent against double-redeem):
//   1. Identify the caller from their JWT.
//   2. Atomically CLAIM the code: UPDATE ... WHERE code = ? AND redeemed_by IS
//      NULL. If no row comes back, the code is invalid or already used.
//   3. Upsert the entitlement (source = 'code'); on conflict do nothing.
//
// Secrets (set as Edge Function secrets, never in the repo):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// (SUPABASE_URL / SUPABASE_ANON_KEY are provided by the platform by default.)

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Who is calling? Verify the JWT via the anon client + caller's auth header.
  const authHeader = req.headers.get('Authorization') ?? '';
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userErr,
  } = await caller.auth.getUser();
  if (userErr || !user) return json({ error: 'Not authenticated' }, 401);

  let code: unknown;
  try {
    ({ code } = await req.json());
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }
  if (typeof code !== 'string' || code.trim() === '') {
    return json({ error: 'A code is required' }, 400);
  }
  const normalized = code.trim().toUpperCase();

  // Privileged client — bypasses RLS for the claim + grant.
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Atomically claim the code (only if currently unredeemed).
  const { data: claimed, error: claimErr } = await admin
    .from('access_codes')
    .update({ redeemed_by: user.id, redeemed_at: new Date().toISOString() })
    .eq('code', normalized)
    .is('redeemed_by', null)
    .select('bundle_id')
    .maybeSingle();

  if (claimErr) return json({ error: 'Redemption failed' }, 500);

  if (!claimed) {
    // Distinguish "already used" from "doesn't exist" for a clearer message.
    const { data: existing } = await admin
      .from('access_codes')
      .select('redeemed_by')
      .eq('code', normalized)
      .maybeSingle();
    if (existing) return json({ error: 'This code has already been redeemed' }, 409);
    return json({ error: 'Invalid code' }, 404);
  }

  // 2. Grant the entitlement (idempotent on the unique (user_id, bundle_id)).
  const { error: grantErr } = await admin
    .from('entitlements')
    .upsert(
      { user_id: user.id, bundle_id: claimed.bundle_id, source: 'code' },
      { onConflict: 'user_id,bundle_id', ignoreDuplicates: true },
    );
  if (grantErr) return json({ error: 'Could not grant access' }, 500);

  return json({ ok: true, bundle_id: claimed.bundle_id });
});
