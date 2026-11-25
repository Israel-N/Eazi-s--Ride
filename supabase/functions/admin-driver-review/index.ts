import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';
import { corsHeadersForRequest } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeadersForRequest(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json(req, { error: 'Server configuration incomplete' }, 500);
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json(req, { error: 'Sign in required' }, 401);
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await caller.auth.getUser();
  if (authError || !user) return json(req, { error: 'Invalid session' }, 401);
  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: adminProfile } = await service.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (adminProfile?.role !== 'admin') return json(req, { error: 'Administrator access required' }, 403);
  let body: { application_id?: string; action?: string; reason?: string };
  try { body = await req.json(); } catch { return json(req, { error: 'Invalid JSON' }, 400); }
  if (!body.application_id || !['approve','reject','suspend','reinstate'].includes(String(body.action))) return json(req, { error: 'Invalid application_id or action' }, 400);
  const { data, error } = await caller.rpc('review_driver_application', {
    p_application_id: body.application_id,
    p_action: body.action,
    p_reason: String(body.reason ?? '').trim().slice(0, 500) || null,
  });
  if (error) return json(req, { error: error.message }, error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 409);
  const userId = data?.user_id;
  if (userId) {
    const title = body.action === 'approve' || body.action === 'reinstate' ? 'Driver application approved' : body.action === 'suspend' ? 'Driver account suspended' : 'Driver application update';
    const message = body.action === 'approve' || body.action === 'reinstate'
      ? 'Your driver account is approved. You can sign in to the Eazi\'s Ride driver app.'
      : body.action === 'suspend' ? 'Your driver account has been suspended. Contact support for details.'
      : `Your application was not approved. ${String(body.reason ?? '').trim() || "Open Eazi's Ride to contact support."}`;
    await notifyDriver(service, userId, title, message);
  }
  return json(req, data ?? { success: true });
});

async function notifyDriver(admin: any, userId: string, title: string, body: string) {
  const { data } = await admin.from('device_push_tokens').select('expo_push_token').eq('user_id', userId);
  const tokens = (data ?? []).map((row: any) => row.expo_push_token);
  for (let i = 0; i < tokens.length; i += 100) {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(tokens.slice(i, i + 100).map((to: string) => ({ to, title, body, sound: 'default', data: { screen: 'driver-application' } }))),
    });
  }
}
function json(req: Request, body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeadersForRequest(req), 'Content-Type': 'application/json' } }); }
