import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';
import { corsHeadersForRequest } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeadersForRequest(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
  if (!url || !anon || !service || !secret) return json(req, { error: 'Payment service is not configured' }, 500);
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return json(req, { error: 'Sign in required' }, 401);
  const caller = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json(req, { error: 'Invalid session' }, 401);
  let body: { ride_id?: string; method?: 'mobile_money' | 'card' };
  try { body = await req.json(); } catch { return json(req, { error: 'Invalid JSON' }, 400); }
  if (!body.ride_id || !['mobile_money', 'card'].includes(String(body.method))) return json(req, { error: 'ride_id and a supported payment method are required' }, 400);
  const db = createClient(url, service, { auth: { persistSession: false } });
  const { data: ride, error: rideError } = await db.from('rides').select('id,rider_id,driver_id,status,fare,payment_method').eq('id', body.ride_id).maybeSingle();
  if (rideError || !ride) return json(req, { error: 'Ride not found' }, 404);
  if (ride.rider_id !== user.id) return json(req, { error: 'Only the rider who booked this ride can pay for it' }, 403);
  if (ride.status !== 'completed') return json(req, { error: 'Payment can only be initiated after the ride is completed' }, 409);
  const { data: existingPayments } = await db.from('payments').select('id,status,provider_reference,metadata').eq('ride_id', ride.id).in('status', ['pending','successful','review_required']).order('created_at', { ascending: false }).limit(1);
  const existing = existingPayments?.[0];
  if (existing?.status === 'successful') return json(req, { status: 'successful', message: 'This ride is already paid.' });
  if (existing?.status === 'review_required') return json(req, { error: 'A payment needs manual review before another payment can be attempted.', reference: existing.provider_reference }, 409);
  if (existing?.status === 'pending') {
    const savedUrl = existing.metadata?.authorization_url;
    if (savedUrl && existing.provider_reference) return json(req, { authorization_url: savedUrl, reference: existing.provider_reference, resumed: true });
    return json(req, { error: 'A payment is already pending for this ride. Retry in a moment or contact support with the payment reference.', reference: existing.provider_reference }, 409);
  }
  const amount = Math.round(Number(ride.fare) * 100);
  if (!Number.isFinite(amount) || amount < 100) return json(req, { error: 'Invalid fare amount' }, 400);
  const reference = `EAZI-${crypto.randomUUID()}`;
  const { data: profile } = await db.from('profiles').select('email,phone,full_name').eq('id', user.id).single();
  const { error: insertError } = await db.from('payments').insert({ user_id: user.id, ride_id: ride.id, amount: Number(ride.fare), currency: 'GHS', method: body.method, provider: 'paystack', provider_reference: reference, transaction_reference: reference, status: 'pending', metadata: { source: 'eazis-ride' } });
  if (insertError) return json(req, { error: insertError.code === '23505' ? 'A payment is already pending for this ride. Refresh payment status before trying again.' : 'Could not create payment record' }, insertError.code === '23505' ? 409 : 500);
  const callback = Deno.env.get('PAYMENT_CALLBACK_URL');
  const payload = { email: profile?.email || user.email, amount, currency: 'GHS', reference, channels: [body.method === 'card' ? 'card' : 'mobile_money'], callback_url: callback, metadata: { ride_id: ride.id, user_id: user.id, method: body.method, app: "Eazi's Ride" } };
  const response = await fetch('https://api.paystack.co/transaction/initialize', { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const result = await response.json();
  if (!response.ok || !result.status || !result.data?.authorization_url) {
    await db.from('payments').update({ status: 'failed', updated_at: new Date().toISOString(), metadata: { provider_error: String(result.message || 'initialize failed').slice(0, 200) } }).eq('provider_reference', reference);
    return json(req, { error: 'Payment provider could not start checkout', detail: result.message }, 502);
  }
  await db.from('payments').update({ metadata: { source: 'eazis-ride', authorization_url: result.data.authorization_url, access_code: result.data.access_code }, updated_at: new Date().toISOString() }).eq('provider_reference', reference);
  return json(req, { authorization_url: result.data.authorization_url, reference, access_code: result.data.access_code });
});
function json(req: Request, body: unknown, status=200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeadersForRequest(req), 'Content-Type': 'application/json' } }); }
