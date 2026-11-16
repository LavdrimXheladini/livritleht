import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@movershub/mobile';

import { callFunction } from './functions';
import type { LonLat } from './route-map-html';

type Point = { lat: number; lon: number };

/**
 * The line to draw for a move: the road from the `route` function (asked once per pair of places and
 * kept), and until it answers — or when it can't — the straight line between the two places.
 */
export function useRouteLine(from: Point, to: Point): readonly LonLat[] {
  const { supabase } = useAuth();
  const road = useQuery({
    queryKey: ['route', from.lat, from.lon, to.lat, to.lon],
    staleTime: Infinity,
    retry: 1,
    queryFn: async (): Promise<LonLat[]> => {
      const answer = await callFunction<{ geometry: LonLat[] }>(supabase, 'route', { from, to }, 8_000);
      if (!answer.ok) throw new Error(answer.error);
      return answer.data.geometry;
    },
  });
  return road.data && road.data.length > 1 ? road.data : [[from.lon, from.lat], [to.lon, to.lat]];
}
