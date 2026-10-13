const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

/**
 * False on a fresh copy without web/app/.env.local (README "Run it locally", step 3): the pages still
 * open — with the labelled sample prices — but signing in and the waitlist can't reach a database.
 */
export const supabaseConfigured = url !== '' && key !== '';

// Placeholders keep the Supabase helpers from throwing on an unconfigured copy; requests to them
// simply fail and the pages show their usual error texts.
export const supabaseUrl = url || 'http://127.0.0.1:54321';
export const supabaseKey = key || 'not-configured';

if (!supabaseConfigured) {
  console.warn(
    'Supabase env missing: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in web/app/.env.local ' +
      "(README \"Run it locally\", step 3). The website opens without them, with sample prices; sign-in won't work.",
  );
}
