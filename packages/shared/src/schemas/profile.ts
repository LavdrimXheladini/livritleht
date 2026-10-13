import { z } from 'zod';

import { LOCALES, USER_ROLES } from '../constants';

export const profileSchema = z.object({
  id: z.uuid(),
  /** Chosen after the first sign-in, then switchable between customer and mover (`public.choose_role`); admin only by the platform; null until chosen. */
  role: z.enum(USER_ROLES).nullable(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  locale: z.enum(LOCALES),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Profile = z.infer<typeof profileSchema>;

/** Fields a user may change on their own profile (role is never client-editable). */
export const profileUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  locale: z.enum(LOCALES).optional(),
});
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;
