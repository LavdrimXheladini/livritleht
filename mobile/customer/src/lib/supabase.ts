import { createSupabaseClient } from '@ranktrip/mobile';

export const supabase = createSupabaseClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
);
