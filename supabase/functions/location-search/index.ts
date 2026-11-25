import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';
import { corsHeadersForRequest } from '../_shared/cors.ts';

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeadersForRequest(req),
      'Content-Type': 'application/json',
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeadersForRequest(req),
    });
  }

  if (req.method !== 'POST') {
    return json(req, { error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey =
      Deno.env.get('SUPABASE_ANON_KEY') ??
      Deno.env.get('SUPABASE_PUBLISHABLE_KEY');

    const geoapifyKey = Deno.env.get('GEOAPIFY_API_KEY');

    if (!supabaseUrl || !anonKey || !geoapifyKey) {
      return json(req, {
        error: 'Location search service is not configured.',
      }, 500);
    }

    // Require an authenticated Supabase user.
    const authHeader = req.headers.get('Authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return json(req, { error: 'Sign in required.' }, 401);
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return json(req, { error: 'Invalid session.' }, 401);
    }

    // Validate the search query.
    let body: { query?: string };

    try {
      body = await req.json();
    } catch {
      return json(req, { error: 'Invalid JSON request.' }, 400);
    }

    const query = String(body.query ?? '').trim();

    if (query.length < 2) {
      return json(req, { suggestions: [] });
    }

    if (query.length > 120) {
      return json(req, { error: 'Search query is too long.' }, 400);
    }

    // Search Ghana using Geoapify.
    const url = new URL(
      'https://api.geoapify.com/v1/geocode/autocomplete'
    );

    url.searchParams.set('text', query);
    url.searchParams.set('filter', 'countrycode:gh');
    url.searchParams.set('limit', '6');
    url.searchParams.set('lang', 'en');
    url.searchParams.set('apiKey', geoapifyKey);

    const response = await fetch(url.toString());

    if (!response.ok) {
      console.error('Geoapify search failed with status:', response.status);

      return json(req, {
        error: 'Location search is temporarily unavailable.',
      }, 502);
    }

    const result = await response.json();
    const features = Array.isArray(result.features)
      ? result.features
      : [];

    // Normalize provider results so the rider app does not depend
    // directly on Geoapify's response format.
    const suggestions = features
      .map((feature: any) => {
        const properties = feature.properties ?? {};
        const coordinates = feature.geometry?.coordinates ?? [];

        const lat = Number(properties.lat ?? coordinates[1]);
        const lng = Number(properties.lon ?? coordinates[0]);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return null;
        }

        const label =
          properties.formatted ??
          properties.address_line1 ??
          properties.name ??
          '';

        const details = [
          properties.suburb,
          properties.district,
          properties.city,
          properties.state,
        ]
          .filter(Boolean)
          .filter((value: string, index: number, values: string[]) =>
            values.indexOf(value) === index
          );

        return {
          placeId: String(
            properties.place_id ?? properties.datasource?.raw?.place_id ?? ''
          ),
          label,
          secondaryLabel: details.join(', '),
          lat,
          lng,
        };
      })
      .filter(Boolean);

    return json(req, { suggestions });
  } catch (error) {
    console.error(
      'Location search failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );

    return json(req, {
      error: 'Unable to search locations right now.',
    }, 500);
  }
});
