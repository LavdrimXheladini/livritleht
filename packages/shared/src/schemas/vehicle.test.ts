import { describe, expect, it } from 'vitest';

import { tonnes, vehicleColumns, vehicleFormDefaults, vehicleFormSchema, vehiclesStepStatus, vehicleStatus, type VehicleFormInput } from './vehicle';

const van: VehicleFormInput = {
  vehicleClass: 'VAN',
  plate: ' 01-234 ab ',
  maxWeightKg: '2800',
  volumeM3: '6,5',
  hasTailLift: false,
  tachograph: true,
};

const errors = (input: Partial<VehicleFormInput>) =>
  Object.fromEntries(
    (vehicleFormSchema.safeParse({ ...van, ...input }).error?.issues ?? []).map((i) => [i.path.join('.'), i.message]),
  );

describe('vehicleFormSchema', () => {
  it('accepts a van and stores it tidied: plate in capitals, weight in kg, volume with a decimal point', () => {
    expect(vehicleColumns(vehicleFormSchema.parse(van))).toEqual({
      class: 'VAN',
      plate: '01-234 AB',
      max_weight_kg: 2800,
      volume_m3: 6.5,
      has_tail_lift: false,
      tachograph: true,
    });
  });

  it('needs every field, in a real format', () => {
    expect(errors({ vehicleClass: undefined as never, plate: '', maxWeightKg: '', volumeM3: '' })).toEqual({
      vehicleClass: 'class_required',
      plate: 'plate_required',
      maxWeightKg: 'weight_required',
      volumeM3: 'volume_required',
    });
    expect(errors({ plate: 'PR*123' })).toEqual({ plate: 'plate_invalid' });
    expect(vehicleFormSchema.parse({ ...van, plate: 'lö-ab 12' }).plate).toBe('LÖ-AB 12');
    expect(errors({ maxWeightKg: '2.8' })).toEqual({ maxWeightKg: 'weight_invalid' });
    expect(errors({ maxWeightKg: '90' })).toEqual({ maxWeightKg: 'weight_invalid' });
    expect(errors({ volumeM3: '6.55' })).toEqual({ volumeM3: 'volume_invalid' });
    expect(errors({ volumeM3: '0' })).toEqual({ volumeM3: 'volume_invalid' });
  });

  it('only a truck is over 3.5 t, and a truck is over 3.5 t', () => {
    expect(errors({ maxWeightKg: '4200' })).toEqual({ maxWeightKg: 'weight_too_heavy_for_class' });
    expect(errors({ vehicleClass: 'TRUCK', maxWeightKg: '3500' })).toEqual({ maxWeightKg: 'weight_too_light_for_truck' });
    expect(errors({ vehicleClass: 'TRUCK', maxWeightKg: '7500' })).toEqual({});
    expect(errors({ vehicleClass: 'BOX', maxWeightKg: '3500' })).toEqual({});
  });

  it('keeps no tachograph for vans up to 2.5 t (it is asked only above)', () => {
    expect(vehicleFormSchema.parse({ ...van, maxWeightKg: '2200', tachograph: true }).tachograph).toBe(false);
    expect(vehicleFormSchema.parse({ ...van, maxWeightKg: '2600', tachograph: true }).tachograph).toBe(true);
  });
});

describe('status', () => {
  it('per van and for the checklist', () => {
    expect(vehicleStatus({ active: false, verified_at: '2026-10-01' })).toBe('inactive');
    expect(vehicleStatus({ active: true, verified_at: null })).toBe('checking');
    expect(vehicleStatus({ active: true, verified_at: '2026-10-01' })).toBe('verified');
    expect(vehiclesStepStatus([])).toBe('todo');
    expect(vehiclesStepStatus([{ active: false, verified_at: '2026-10-01' }])).toBe('todo');
    expect(vehiclesStepStatus([{ active: true, verified_at: null }])).toBe('saved');
    expect(vehiclesStepStatus([{ active: true, verified_at: null }, { active: true, verified_at: '2026-10-01' }])).toBe('verified');
  });

  it('shows weights in tonnes and fills the form from a saved van', () => {
    expect([tonnes(2800), tonnes(3500), tonnes(7490)]).toEqual(['2.8 t', '3.5 t', '7.5 t']);
    expect(
      vehicleFormDefaults({
        id: '00000000-0000-4000-8000-000000000001',
        class: 'BOX',
        plate: 'PR 123 AB',
        max_weight_kg: 3500,
        volume_m3: 20,
        has_tail_lift: true,
        tachograph: false,
        active: true,
        verified_at: null,
        created_at: '2026-10-15T09:00:00Z',
      }),
    ).toEqual({ vehicleClass: 'BOX', plate: 'PR 123 AB', maxWeightKg: '3500', volumeM3: '20', hasTailLift: true, tachograph: false });
  });
});
