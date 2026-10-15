import { z } from 'zod';

import { VEHICLE_CLASSES } from '../constants';

/** Vans up to this weight drive with a car licence and need no tachograph or operator licence (§5, §11). */
export const LIGHT_VEHICLE_MAX_KG = 2500;
/** Every class but TRUCK is at most 3.5 t (Postgres: vehicles_weight_fits_class). */
export const VAN_MAX_KG = 3500;

/**
 * Plates as written on the vehicle: letters (with the umlauts of German and Austrian district codes,
 * e.g. "LÖ", "VÖ"), digits, spaces and dashes; stored in capitals. Postgres checks the same.
 */
const PLATE = /^[A-Z0-9ÄÖÜ][A-Z0-9ÄÖÜ -]{1,15}$/;

/**
 * The "Add a van" form (COMPLIANCE §5: plate, type, capacity; §11: weight class and tachograph for
 * cross-border jobs). Messages are i18n keys (mover.vehicles.errors). The weight is the maximum
 * permissible weight on the registration certificate (field F.2). Postgres checks again: the class
 * fits the weight, movers can't mark a van checked, and a change to class, plate, weight or tachograph
 * sends a checked van back to the check.
 */
export const vehicleFormSchema = z
  .object({
    vehicleClass: z.enum(VEHICLE_CLASSES, 'class_required'),
    plate: z
      .string()
      .trim()
      .transform((v) => v.toUpperCase().replace(/\s+/g, ' '))
      .pipe(z.string().min(2, { error: 'plate_required', abort: true }).max(16, 'plate_invalid').regex(PLATE, 'plate_invalid')),
    maxWeightKg: z
      .string()
      .trim()
      .min(1, { error: 'weight_required', abort: true })
      .regex(/^\d{3,5}$/, 'weight_invalid')
      .transform(Number)
      .pipe(z.number().int().min(500, 'weight_invalid').max(44_000, 'weight_invalid')),
    volumeM3: z
      .string()
      .trim()
      .min(1, { error: 'volume_required', abort: true })
      .transform((v) => v.replace(',', '.'))
      .pipe(z.string().regex(/^\d{1,3}(\.\d)?$/, 'volume_invalid'))
      .transform(Number)
      .pipe(z.number().min(1, 'volume_invalid').max(120, 'volume_invalid')),
    hasTailLift: z.boolean(),
    tachograph: z.boolean(),
  })
  .refine((v) => v.vehicleClass === 'TRUCK' || v.maxWeightKg <= VAN_MAX_KG, {
    path: ['maxWeightKg'],
    error: 'weight_too_heavy_for_class',
    when: (payload) => vehicleWeightParses(payload.value),
  })
  .refine((v) => v.vehicleClass !== 'TRUCK' || v.maxWeightKg > VAN_MAX_KG, {
    path: ['maxWeightKg'],
    error: 'weight_too_light_for_truck',
    when: (payload) => vehicleWeightParses(payload.value),
  })
  // A tachograph is asked only over 2.5 t; lighter vans keep none.
  .transform((v) => ({ ...v, tachograph: v.maxWeightKg > LIGHT_VEHICLE_MAX_KG && v.tachograph }));
export type VehicleFormInput = z.input<typeof vehicleFormSchema>;
export type VehicleForm = z.output<typeof vehicleFormSchema>;

function vehicleWeightParses(value: unknown): boolean {
  const v = value as { vehicleClass?: unknown; maxWeightKg?: unknown };
  return (VEHICLE_CLASSES as readonly unknown[]).includes(v.vehicleClass) && typeof v.maxWeightKg === 'number';
}

/** The columns a mover may write on `vehicles` (its column grants), from the checked form. */
export function vehicleColumns(form: VehicleForm) {
  return {
    class: form.vehicleClass,
    plate: form.plate,
    max_weight_kg: form.maxWeightKg,
    volume_m3: form.volumeM3,
    has_tail_lift: form.hasTailLift,
    tachograph: form.tachograph,
  };
}

/** A van as the app reads it (RLS: the company's owner only). */
export const vehicleRowSchema = z.object({
  id: z.uuid(),
  class: z.enum(VEHICLE_CLASSES),
  plate: z.string(),
  max_weight_kg: z.number().nullable(),
  volume_m3: z.coerce.number().nullable(),
  has_tail_lift: z.boolean(),
  tachograph: z.boolean(),
  active: z.boolean(),
  verified_at: z.string().nullable(),
  created_at: z.string(),
  /** MoversHub's note when it asks for changes; cleared when the mover changes the van. */
  review_note: z.string().nullish(),
});
export type VehicleRow = z.infer<typeof vehicleRowSchema>;
export const VEHICLE_COLUMNS = Object.keys(vehicleRowSchema.shape).join(', ');

/** The form's starting values: an empty form, or the saved van. */
export function vehicleFormDefaults(row: VehicleRow | null): Partial<VehicleFormInput> {
  if (!row) return { plate: '', maxWeightKg: '', volumeM3: '', hasTailLift: false, tachograph: false };
  return {
    vehicleClass: row.class,
    plate: row.plate,
    maxWeightKg: row.max_weight_kg === null ? '' : String(row.max_weight_kg),
    volumeM3: row.volume_m3 === null ? '' : String(row.volume_m3),
    hasTailLift: row.has_tail_lift,
    tachograph: row.tachograph,
  };
}

/** Where one van stands: in use and checked, waiting for the check, changes asked, or not in use. */
export const vehicleStatus = (
  row: Pick<VehicleRow, 'active' | 'verified_at'> & { review_note?: string | null | undefined },
): 'verified' | 'checking' | 'changes' | 'inactive' =>
  !row.active ? 'inactive' : row.verified_at ? 'verified' : row.review_note ? 'changes' : 'checking';

/** The checklist's summary: no van in use yet, vans waiting for the check, or at least one checked van in use. */
export function vehiclesStepStatus(
  rows: readonly (Pick<VehicleRow, 'active' | 'verified_at'> & { review_note?: string | null | undefined })[],
): 'todo' | 'saved' | 'verified' | 'rejected' {
  const inUse = rows.filter((r) => r.active);
  if (inUse.length === 0) return 'todo';
  if (inUse.some((r) => r.verified_at)) return 'verified';
  return inUse.some((r) => r.review_note) ? 'rejected' : 'saved';
}

/** "2.8 t" from kilograms (one decimal, no trailing ".0"). */
export const tonnes = (kg: number) => `${Number((kg / 1000).toFixed(1))} t`;
