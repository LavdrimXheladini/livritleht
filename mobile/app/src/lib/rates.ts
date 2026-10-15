import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  RATE_CARD_COLUMNS,
  rateCardColumns,
  rateCardRowSchema,
  serviceAreaColumns,
  serviceAreaRowSchema,
  type RateCard,
  type RateCardRow,
  type ServiceAreaRow,
} from '@movershub/shared';
import { useAuth } from '@movershub/mobile';

const cardsKey = (companyId: string | undefined) => ['rate-cards', companyId] as const;
const areasKey = (companyId: string | undefined) => ['service-areas', companyId] as const;

/** The prices of the company's vans (RLS: the owner of the vans' company only). */
export function useRateCards(companyId: string | undefined) {
  const { supabase } = useAuth();
  return useQuery({
    queryKey: cardsKey(companyId),
    enabled: companyId !== undefined,
    retry: 1,
    networkMode: 'always',
    staleTime: 60_000,
    queryFn: async (): Promise<RateCardRow[]> => {
      const { data, error } = await supabase.from('rate_cards').select(`${RATE_CARD_COLUMNS}, vehicles!inner(company_id)`).eq('vehicles.company_id', companyId ?? '');
      if (error) throw error;
      return rateCardRowSchema.array().parse(data);
    },
  });
}

/**
 * Saves a van's prices: the first time a new card, then changes to it. Saving is the mover's
 * confirmation — Postgres records it (rate_cards_confirm_on_save), and only confirmed cards are quoted.
 */
export function useSaveRateCard(companyId: string | undefined) {
  const { supabase } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: 'always',
    mutationFn: async ({ vehicleId, card, exists }: { vehicleId: string; card: RateCard; exists: boolean }) => {
      const columns = rateCardColumns(card);
      const write = exists
        ? supabase.from('rate_cards').update(columns).eq('vehicle_id', vehicleId)
        : supabase.from('rate_cards').insert({ ...columns, vehicle_id: vehicleId });
      const { data, error } = await write.select(RATE_CARD_COLUMNS).single();
      if (error) throw error;
      return rateCardRowSchema.parse(data);
    },
    onSuccess: (row) =>
      queryClient.setQueryData<RateCardRow[]>(cardsKey(companyId), (rows = []) => [...rows.filter((r) => r.vehicle_id !== row.vehicle_id), row]),
  });
}

/** Where the company picks up jobs: towns with a radius (RLS: its owner manages them). */
export function useServiceAreas(companyId: string | undefined) {
  const { supabase } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: areasKey(companyId),
    enabled: companyId !== undefined,
    retry: 1,
    networkMode: 'always',
    staleTime: 60_000,
    queryFn: async (): Promise<ServiceAreaRow[]> => {
      const { data, error } = await supabase
        .from('service_areas')
        .select('id, label, radius_km')
        .eq('company_id', companyId ?? '')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return serviceAreaRowSchema.array().parse(data);
    },
  });
  const add = useMutation({
    networkMode: 'always',
    mutationFn: async ({ place, radiusKm }: { place: { lat: number; lon: number; area: string }; radiusKm: number }) => {
      if (!companyId) throw new Error('no company');
      const { data, error } = await supabase.from('service_areas').insert(serviceAreaColumns(companyId, place, radiusKm)).select('id, label, radius_km').single();
      if (error) throw error;
      return serviceAreaRowSchema.parse(data);
    },
    onSuccess: (row) => queryClient.setQueryData<ServiceAreaRow[]>(areasKey(companyId), (rows = []) => [...rows, row]),
  });
  const remove = useMutation({
    networkMode: 'always',
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('service_areas').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => queryClient.setQueryData<ServiceAreaRow[]>(areasKey(companyId), (rows = []) => rows.filter((r) => r.id !== id)),
  });
  return { query, add, remove };
}
