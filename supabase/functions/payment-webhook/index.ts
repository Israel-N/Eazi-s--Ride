import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';
import { corsHeadersForRequest } from '../_shared/cors.ts';
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeadersForRequest(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);
  const secret = Deno.env.get('PAYSTACK_SECRET_KEY'), url = Deno.env.get('SUPABASE_URL'), service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const signature = req.headers.get('x-paystack-signature');
  if (!secret || !url || !service || !signature) return json(req, { error: 'Missing webhook configuration/signature' }, 401);
  const raw = await req.text();
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  const expected = [...digest].map(b => b.toString(16).padStart(2,'0')).join('');
  if (!constantTimeEqual(signature.toLowerCase(), expected)) return json(req, { error: 'Invalid signature' }, 401);
  let event: any; try { event = JSON.parse(raw); } catch { return json(req, { error: 'Invalid JSON' }, 400); }
  if (!['charge.success','charge.failed'].includes(event.event) || !event.data?.reference) return json(req, { received: true });
  const db = createClient(url, service, { auth: { persistSession: false } });
  const { data: payment } = await db.from('payments').select('*').eq('provider_reference', event.data.reference).eq('provider','paystack').maybeSingle();
  if (!payment || payment.status === 'successful') return json(req, { received: true });
  // A signed failed event may safely mark a still-pending transaction failed.
  if (event.event === 'charge.failed') {
    await db.from('payments').update({ status: 'failed', provider_transaction_id: String(event.data.id ?? ''), updated_at: new Date().toISOString() }).eq('id', payment.id).neq('status','successful');
    return json(req, { received: true });
  }
  // Verify with Paystack API; do not trust webhook payload alone for amount/currency.
  const verify = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(event.data.reference)}`, { headers: { Authorization: `Bearer ${secret}` } });
  const result = await verify.json(); const tx = result?.data;
  if (!verify.ok || !result.status || tx?.status !== 'success') return json(req, { error: 'Provider verification did not confirm a successful transaction' }, 400);
  if (tx.currency !== 'GHS' || Number(tx.amount) !== Math.round(Number(payment.amount)*100)) {
    await db.from('payments').update({ status: 'review_required', provider_transaction_id: String(tx.id ?? ''), updated_at: new Date().toISOString(), metadata: { verification_mismatch: true, received_amount: tx.amount, received_currency: tx.currency, provider_status: tx.status } }).eq('id', payment.id).neq('status','successful');
    return json(req, { error: 'Provider amount/currency mismatch; manual review required' }, 400);
  }
  const { error } = await db.from('payments').update({ status: 'successful', provider_transaction_id: String(tx.id), paid_at: new Date().toISOString(), updated_at: new Date().toISOString(), metadata: { channel: tx.channel, gateway_response: tx.gateway_response, webhook: true } }).eq('id', payment.id).neq('status','successful');
  if (error) return json(req, { error: 'Could not update payment record' }, 500);
  return json(req, { received: true });
});
function constantTimeEqual(a: string,b: string) { if(a.length!==b.length) return false; let out=0; for(let i=0;i<a.length;i++) out |= a.charCodeAt(i)^b.charCodeAt(i); return out===0; }
function json(req: Request, body: unknown,status=200) { return new Response(JSON.stringify(body),{status,headers:{...corsHeadersForRequest(req),'Content-Type':'application/json'}}); }
