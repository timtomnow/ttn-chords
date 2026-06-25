// Edge Function: Square payment webhook — the only place a purchase grants a
// bundle. Square calls this when a payment changes; on a COMPLETED payment we
// record the purchase and grant the entitlement to the buyer.
//
// Runs with verify_jwt = false (Square can't send a Supabase JWT). Security is
// Square's HMAC-SHA256 signature instead: a bad signature is rejected 401 before
// any DB write. See supabase/config.toml.
//
// Attribution: create-checkout baked user_id + bundle_id into the order's
// metadata, so we read them straight back from the order — no email guessing.
//
// Idempotency: purchases.square_payment_id is UNIQUE; we insert ON CONFLICT DO
// NOTHING and only grant/notify when a NEW purchase row was actually created, so
// duplicate webhook deliveries can't double-grant or double-notify.
//
// Secrets (Edge Function secrets, never the repo):
//   SQUARE_WEBHOOK_SIGNATURE_KEY  — from the Square webhook subscription
//   SQUARE_WEBHOOK_URL            — the exact subscription URL Square signs with
//                                   (defaults to the request URL if unset)
//   SQUARE_ACCESS_TOKEN, SQUARE_ENVIRONMENT, SQUARE_VERSION (optional)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-provided)

import { createClient } from 'jsr:@supabase/supabase-js@2';

function squareBaseUrl(): string {
  return Deno.env.get('SQUARE_ENVIRONMENT') === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';
}

async function hmacBase64(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

// Constant-time string compare (mask timing of the signature check).
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const signatureKey = Deno.env.get('SQUARE_WEBHOOK_SIGNATURE_KEY');
  if (!signatureKey) {
    console.error('[square-webhook] missing SQUARE_WEBHOOK_SIGNATURE_KEY');
    return new Response('Not configured', { status: 500 });
  }

  // 1. Verify Square's signature over (notification URL + raw body).
  const rawBody = await req.text();
  const notificationUrl = Deno.env.get('SQUARE_WEBHOOK_URL') ?? req.url;
  const provided = req.headers.get('x-square-hmacsha256-signature') ?? '';
  const expected = await hmacBase64(signatureKey, notificationUrl + rawBody);
  if (!provided || !safeEqual(provided, expected)) {
    return new Response('Invalid signature', { status: 401 });
  }

  // 2. Parse the event; we only act on a COMPLETED payment.
  let event: { type?: string; data?: { object?: { payment?: Record<string, unknown> } } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const payment = event.data?.object?.payment as
    | { id?: string; status?: string; order_id?: string; amount_money?: { amount?: number } }
    | undefined;
  if (!payment || payment.status !== 'COMPLETED') {
    return new Response('ok', { status: 200 }); // ack non-final / unrelated events
  }
  const squarePaymentId = payment.id;
  const orderId = payment.order_id;
  if (!squarePaymentId || !orderId) return new Response('ok', { status: 200 });

  // 3. Recover user_id + bundle_id from the order metadata we set at checkout.
  const squareToken = Deno.env.get('SQUARE_ACCESS_TOKEN');
  if (!squareToken) {
    console.error('[square-webhook] missing SQUARE_ACCESS_TOKEN');
    return new Response('Not configured', { status: 500 });
  }
  const squareHeaders: Record<string, string> = { Authorization: `Bearer ${squareToken}` };
  const version = Deno.env.get('SQUARE_VERSION');
  if (version) squareHeaders['Square-Version'] = version;

  const orderResp = await fetch(`${squareBaseUrl()}/v2/orders/${orderId}`, {
    headers: squareHeaders,
  });
  const orderData = await orderResp.json().catch(() => ({}));
  if (!orderResp.ok) {
    console.error('[square-webhook] order fetch failed', orderResp.status);
    return new Response('Upstream error', { status: 502 }); // let Square retry
  }
  const order = orderData?.order ?? {};
  const userId: string | undefined = order?.metadata?.user_id;
  const bundleId: string | undefined = order?.metadata?.bundle_id ?? order?.reference_id;
  if (!userId || !bundleId) {
    console.error('[square-webhook] order missing user/bundle metadata', orderId);
    return new Response('ok', { status: 200 }); // nothing we can attribute; don't retry forever
  }
  const amountCents: number | null = payment.amount_money?.amount ?? null;

  // 4. Record + grant, idempotently. A row comes back from the purchases insert
  //    only the FIRST time this payment is seen.
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: inserted, error: purchaseErr } = await admin
    .from('purchases')
    .upsert(
      {
        user_id: userId,
        bundle_id: bundleId,
        square_payment_id: squarePaymentId,
        amount_cents: amountCents,
        status: 'completed',
      },
      { onConflict: 'square_payment_id', ignoreDuplicates: true },
    )
    .select('id');
  if (purchaseErr) {
    console.error('[square-webhook] purchase insert failed', purchaseErr.message);
    return new Response('DB error', { status: 500 }); // let Square retry
  }
  if (!inserted || inserted.length === 0) {
    return new Response('ok', { status: 200 }); // duplicate delivery — already handled
  }

  // Grant the entitlement (idempotent on (user_id, bundle_id)).
  const { error: grantErr } = await admin
    .from('entitlements')
    .upsert(
      { user_id: userId, bundle_id: bundleId, source: 'purchase' },
      { onConflict: 'user_id,bundle_id', ignoreDuplicates: true },
    );
  if (grantErr) {
    console.error('[square-webhook] entitlement grant failed', grantErr.message);
    return new Response('DB error', { status: 500 });
  }

  // In-app notification (best-effort; never fail the grant over this).
  const { data: bundle } = await admin
    .from('bundles')
    .select('title')
    .eq('id', bundleId)
    .maybeSingle();
  const title = bundle?.title as string | undefined;
  const { error: notifyErr } = await admin.from('notifications').insert({
    user_id: userId,
    type: 'purchase',
    title: 'Purchase complete',
    body: title
      ? `“${title}” is now in your library. Thanks for your purchase!`
      : 'Your purchase is complete and is now in your library.',
    bundle_id: bundleId,
  });
  if (notifyErr) console.error('[square-webhook] notification insert failed', notifyErr.message);

  return new Response('ok', { status: 200 });
});
