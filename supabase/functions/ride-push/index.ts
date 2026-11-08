import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';
import { corsHeadersForRequest } from '../_shared/cors.ts';

// Configure as a Supabase Database Webhook on public.rides (INSERT and UPDATE).
// Set x-webhook-secret to the same random value as RIDE_WEBHOOK_SECRET.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeadersForRequest(req) });
  const expected = Deno.env.get('RIDE_WEBHOOK_SECRET');
  if (!expected || !safeEqual(req.headers.get('x-webhook-secret') ?? '', expected)) return json(req, { error: 'Unauthorized webhook' }, 401);
  const url = Deno.env.get('SUPABASE_URL'), service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !service) return json(req, { error: 'Server configuration incomplete' }, 500);
  let payload: any; try { payload = await req.json(); } catch { return json(req, { error: 'Invalid JSON' }, 400); }
  const ride = payload.record ?? payload.new_record;
  const old = payload.old_record ?? {};
  if (!ride?.id) return json(req, { ignored: true });
  const db = createClient(url, service, { auth: { persistSession: false } });
  let targets: string[] = []; let title = "Eazi's Ride update"; let body = 'Your ride status has changed.';
  if (ride.status === 'requested' && !ride.driver_id && (payload.type === 'INSERT' || old.status !== 'requested')) {
    const { data: drivers } = await db.from('driver_profiles').select('user_id,latitude,longitude').eq('is_online', true).eq('is_approved', true).gt('location_updated_at', new Date(Date.now() - 60_000).toISOString());
    const pickupLat = Number(ride.pickup_lat), pickupLng = Number(ride.pickup_lng);
    const kmBetween = (lat:number,lng:number) => { const rad=(v:number)=>v*Math.PI/180; const dLat=rad(lat-pickupLat), dLng=rad(lng-pickupLng); const a=Math.sin(dLat/2)**2+Math.cos(rad(pickupLat))*Math.cos(rad(lat))*Math.sin(dLng/2)**2; return 6371*2*Math.asin(Math.sqrt(Math.min(1,a))); };
    targets = (drivers ?? []).filter((d:any) => Number.isFinite(d.latitude) && Number.isFinite(d.longitude) && kmBetween(d.latitude,d.longitude) <= 10).map((d:any) => d.user_id);
    title = 'New ride request'; body = 'A new ride request is available nearby. Open Eazi\'s Ride to review it.';
  } else if (ride.status !== old.status || ride.driver_id !== old.driver_id) {
    targets = [ride.rider_id, ride.driver_id].filter(Boolean);
    title = ride.status === 'accepted' ? 'Driver assigned' : ride.status === 'arrived' ? 'Driver has arrived' : ride.status === 'completed' ? 'Ride completed' : ride.status === 'cancelled' ? 'Ride cancelled' : 'Ride update';
    body = ride.status === 'accepted' ? 'A driver accepted your ride.' : ride.status === 'arrived' ? 'Your driver has arrived at pickup.' : ride.status === 'completed' ? 'Your ride is complete. Open the app for your receipt.' : ride.status === 'cancelled' ? 'This ride was cancelled.' : `Your ride status is ${String(ride.status).replaceAll('_',' ')}.`;
  }
  targets = [...new Set(targets)]; if (!targets.length) return json(req, { sent: 0 });
  const { data: rows } = await db.from('device_push_tokens').select('id,expo_push_token,user_id').in('user_id', targets);
  const tokens = rows ?? []; if (!tokens.length) return json(req, { sent: 0, reason: 'No registered push tokens' });
  const messages = tokens.map((t: any) => ({ to: t.expo_push_token, title, body, sound: 'default', priority: 'high', channelId: 'rides', data: { rideId: ride.id, status: ride.status, screen: 'ride' } }));
  const sent: any[] = [];
  for (let i=0; i<messages.length; i+=100) {
    const resp = await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(messages.slice(i,i+100)) });
    const result = await resp.json(); if (!resp.ok) return json(req, { error: 'Expo push delivery request failed' }, 502); sent.push(...(result.data ?? []));
  }
  const invalidIds = tokens.filter((_, i) => sent[i]?.details?.error === 'DeviceNotRegistered').map(t => t.id);
  if (invalidIds.length) await db.from('device_push_tokens').delete().in('id', invalidIds);
  return json(req, { sent: messages.length });
});
function safeEqual(a:string,b:string) { if(a.length!==b.length) return false; let n=0; for(let i=0;i<a.length;i++) n |= a.charCodeAt(i)^b.charCodeAt(i); return n===0; }
function json(req: Request, body: unknown,status=200) { return new Response(JSON.stringify(body),{status,headers:{...corsHeadersForRequest(req),'Content-Type':'application/json'}}); }
