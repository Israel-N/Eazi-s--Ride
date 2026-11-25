// Restrict browser origins when APP_ORIGINS (comma-separated) or the legacy
// APP_ORIGIN secret is configured. Webhook/server-to-server requests may omit Origin.
const configuredOrigins = (Deno.env.get('APP_ORIGINS') ?? Deno.env.get('APP_ORIGIN') ?? '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

export function corsHeadersForRequest(req: Request) {
  const origin = req.headers.get('Origin')?.replace(/\/$/, '');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret, x-paystack-signature',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };

  if (configuredOrigins.length === 0) {
    headers['Access-Control-Allow-Origin'] = '*';
  } else if (origin && configuredOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}
