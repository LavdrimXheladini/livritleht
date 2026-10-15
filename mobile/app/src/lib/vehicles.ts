import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { VEHICLE_COLUMNS, vehicleColumns, vehicleRowSchema, type VehicleForm, type VehicleRow } from '@movershub/shared';
import { useAuth } from '@movershub/mobile';

const vehiclesKey = (companyId: string | undefined) => ['vehicles', companyId] as const;

/** The company's vans (RLS: its owner only), oldest first. */
export function useVehicles(companyId: string | undefined) {
  const { supabase } = useAuth();
  return useQuery({
    queryKey: vehiclesKey(companyId),
    enabled: companyId !== undefined,
    retry: 1,
    networkMode: 'always',
    staleTime: 60_000,
    queryFn: async (): Promise<VehicleRow[]> => {
      const { data, error } = await supabase
        .from('vehicles')
        .select(VEHICLE_COLUMNS)
        .eq('company_id', companyId ?? '')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return vehicleRowSchema.array().parse(data);
    },
  });
}

/**
 * Saves a van: adds it, or changes it (Postgres sends a checked van back to the check when its class,
 * plate, weight or tachograph changes), or takes it out of / back into use. Movers can't delete vans:
 * prices and later jobs refer to them.
 */
export function useSaveVehicle(companyId: string | undefined) {
  const { supabase } = useAuth();
  const queryClient = useQueryClient();
  const keep = (row: VehicleRow) =>
    queryClient.setQueryData<VehicleRow[]>(vehiclesKey(companyId), (rows = []) =>
      rows.some((r) => r.id === row.id) ? rows.map((r) => (r.id === row.id ? row : r)) : [...rows, row],
    );
  return {
    save: useMutation({
      networkMode: 'always',
      mutationFn: async ({ form, vehicleId }: { form: VehicleForm; vehicleId: string | null }) => {
        if (!companyId) throw new Error('no company');
        const columns = vehicleColumns(form);
        const write = vehicleId
          ? supabase.from('vehicles').update(columns).eq('id', vehicleId)
          : supabase.from('vehicles').insert({ ...columns, company_id: companyId });
        const { data, error } = await write.select(VEHICLE_COLUMNS).single();
        if (error) throw error;
        return vehicleRowSchema.parse(data);
      },
      onSuccess: keep,
    }),
    setActive: useMutation({
      networkMode: 'always',
      mutationFn: async ({ vehicleId, active }: { vehicleId: string; active: boolean }) => {
        const { data, error } = await supabase.from('vehicles').update({ active }).eq('id', vehicleId).select(VEHICLE_COLUMNS).single();
        if (error) throw error;
        return vehicleRowSchema.parse(data);
      },
      onSuccess: keep,
    }),
  };
}
