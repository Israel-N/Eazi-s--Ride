import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';
import { corsHeadersForRequest } from '../_shared/cors.ts';
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeadersForRequest(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), secret = Deno.env.get('PAYSTACK_SECRET_KEY');
  if (!url || !anon || !service || !secret) return json(req, { error: 'Payment service is not configured' }, 500);
  const auth = req.headers.get('Authorization'); if (!auth?.startsWith('Bearer ')) return json(req, { error: 'Sign in required' }, 401);
  const caller = createClient(url, anon, { global: { headers: { Authorization: auth } } }); const { data: { user } } = await caller.auth.getUser();
  if (!user) return json(req, { error: 'Invalid session' }, 401);
  let body: { reference?: string }; try { body = await req.json(); } catch { return json(req, { error: 'Invalid JSON' }, 400); }
  if (!body.reference) return json(req, { error: 'reference is required' }, 400);
  const db = createClient(url, service, { auth: { persistSession: false } });
  const { data: payment } = await db.from('payments').select('*').eq('provider_reference', body.reference).eq('user_id', user.id).maybeSingle();
  if (!payment) return json(req, { error: 'Payment not found' }, 404);
  if (payment.status === 'successful') return json(req, { status: 'successful', payment_id: payment.id });
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(body.reference)}`, { headers: { Authorization: `Bearer ${secret}` } });
  const result = await response.json();
  if (!response.ok || !result.status || !result.data) return json(req, { error: 'Could not verify payment with provider' }, 502);
  const tx = result.data;
  const expectedKobo = Math.round(Number(payment.amount) * 100);
  const success = tx.status === 'success' && tx.currency === 'GHS' && Number(tx.amount) === expectedKobo;
  if (!success) {
    if (tx.status === 'success' && (tx.currency !== 'GHS' || Number(tx.amount) !== expectedKobo)) {
      await db.from('payments').update({ status: 'review_required', provider_transaction_id: String(tx.id ?? ''), updated_at: new Date().toISOString(), metadata: { verification_mismatch: true, received_amount: tx.amount, received_currency: tx.currency, provider_status: tx.status } }).eq('id', payment.id).neq('status','successful');
    } else if (['failed','abandoned'].includes(tx.status)) {
      await db.from('payments').update({ status: 'failed', provider_transaction_id: String(tx.id ?? ''), updated_at: new Date().toISOString() }).eq('id', payment.id).neq('status','successful');
    }
    return json(req, { status: tx.status === 'success' ? 'mismatch' : tx.status, error: 'Payment is not verified as successful for the expected amount and currency' }, 409);
  }
  const { error: updateError } = await db.from('payments').update({ status: 'successful', provider_transaction_id: String(tx.id), paid_at: new Date().toISOString(), updated_at: new Date().toISOString(), metadata: { channel: tx.channel, gateway_response: tx.gateway_response } }).eq('id', payment.id).neq('status','successful');
  if (updateError) return json(req, { error: 'Payment verified but record update failed; retry verification' }, 500);
  return json(req, { status: 'successful', payment_id: payment.id });
});
function json(req: Request, body: unknown, status=200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeadersForRequest(req), 'Content-Type': 'application/json' } }); }
