// HTTP helpers for the public functions (`quote`, `places`).

/**
 * Browsers may call the functions only from local development: the apps' browser preview (Expo
 * web, ports 8081 / 8082). The website calls them from its server and the phone apps don't use
 * CORS, so no other origin needs them — and other sites can't build on our address search.
 */
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin');
  if (!origin || !DEV_ORIGIN.test(origin)) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // supabase-js sends authorization, apikey, x-client-info and content-type.
    'Access-Control-Allow-Headers': req.headers.get('Access-Control-Request-Headers') ?? 'authorization, apikey, x-client-info, content-type',
    Vary: 'Origin',
  };
}

/** JSON answer, with CORS headers when the request comes from the local preview. */
export const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } });

/** Answer to the browser's CORS preflight (OPTIONS). */
export const preflight = (req: Request) => new Response(null, { status: 204, headers: corsHeaders(req) });

/**
 * What failed, for the function log — without personal data: network errors quote the request
 * URL, and that URL carries the typed address or the stops' coordinates (COMPLIANCE §9).
 */
export const failure = (e: unknown) =>
  e instanceof Error ? (e.stack ?? `${e.name}: ${e.message}`).replace(/https?:\/\/\S+/g, '<url>') : 'unknown error';
