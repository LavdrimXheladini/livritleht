'use client';

import 'maplibre-gl/dist/maplibre-gl.css';

import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';

import { colors } from '@ranktrip/ui';

import type { LineCoords } from '@/lib/geo/types';
import { lineCollection, loadMapLibre, markerElement as el, VAN_SVG } from '@/lib/map/load';

/**
 * Live route map (decorative on the landing page: no pan/zoom). Loads MapLibre and the tiles only
 * when scrolled into view — keeps the page light and avoids contacting the tile server for
 * visitors who never see the map. Calls `onReady` once tiles are drawn, `onFail` if WebGL or the
 * style can't load (the parent keeps its illustrated fallback).
 */
export function RouteMap({
  geometry,
  van,
  done,
  dropoffLabel,
  onReady,
  onFail,
}: {
  geometry: LineCoords;
  /** Current van position [lon, lat]. */
  van: [number, number];
  /** Travelled part of the route. */
  done: LineCoords;
  dropoffLabel: string;
  onReady: () => void;
  onFail: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<{ pickup: Marker; dropoff: Marker; van: Marker } | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Latest props for the async init (refs are updated after render, never during it).
  const latest = useRef({ geometry, van, done, dropoffLabel, onReady, onFail });
  useEffect(() => {
    latest.current = { geometry, van, done, dropoffLabel, onReady, onFail };
  });

  // Create the map once, when visible.
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    let cancelled = false;

    const init = async () => {
      try {
        const {
          lib: { Map, Marker, LngLatBounds },
          style,
        } = await loadMapLibre();
        if (cancelled) return;
        const { geometry: g, van: v, dropoffLabel: label } = latest.current;
        const bounds = g.reduce((b, c) => b.extend(c), new LngLatBounds(g[0]!, g[0]!));
        const m = new Map({
          container: node,
          style,
          bounds,
          fitBoundsOptions: { padding: fitPadding(node) },
          interactive: false,
          attributionControl: { compact: true },
        });
        map.current = m;

        m.on('load', () => {
          if (cancelled) return;
          m.addSource('route', { type: 'geojson', data: lineCollection(latest.current.geometry) });
          m.addSource('done', { type: 'geojson', data: lineCollection(latest.current.done) });
          m.addLayer({
            id: 'route',
            type: 'line',
            source: 'route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': colors.brand[300], 'line-width': 4, 'line-dasharray': [0.5, 2] },
          });
          m.addLayer({
            id: 'done',
            type: 'line',
            source: 'done',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': colors.accent[500], 'line-width': 4 },
          });
          setLoaded(true);
          latest.current.onReady();
        });
        m.on('error', (e) => console.warn('map error', e.error?.message));

        const first = g[0]!;
        const last = g[g.length - 1]!;
        markers.current = {
          pickup: new Marker({ element: el('size-3.5 rounded-full border-3 border-night-700 bg-stone-50') }).setLngLat(first).addTo(m),
          dropoff: new Marker({
            anchor: 'bottom',
            element: el(
              'flex flex-col items-center gap-1',
              `<span data-label class="rounded-sm bg-stone-50 px-2.5 py-1.25 text-xs font-semibold whitespace-nowrap text-ink-900"></span><span class="block size-3 rotate-45 rounded-[2px_50%_50%_50%] bg-stone-50"></span>`,
            ),
          })
            .setLngLat(last)
            .addTo(m),
          van: new Marker({
            element: el(
              'flex size-8.5 items-center justify-center rounded-full bg-accent-500 text-ink-900 motion-safe:animate-pulse-ring',
              VAN_SVG,
            ),
          })
            .setLngLat(v)
            .addTo(m),
        };
        const labelEl = markers.current.dropoff.getElement().querySelector('[data-label]');
        if (labelEl) labelEl.textContent = label;
      } catch (e) {
        console.warn('map unavailable', e);
        if (!cancelled) latest.current.onFail();
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          void init();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => {
      cancelled = true;
      observer.disconnect();
      map.current?.remove();
      map.current = null;
      markers.current = null;
    };
  }, []);

  // New route: redraw the line, move pins, fit the view.
  useEffect(() => {
    const m = map.current;
    if (!m || !loaded) return;
    (m.getSource('route') as GeoJSONSource | undefined)?.setData(lineCollection(geometry));
    markers.current?.pickup.setLngLat(geometry[0]!);
    markers.current?.dropoff.setLngLat(geometry[geometry.length - 1]!);
    const node = container.current;
    void import('maplibre-gl').then(({ LngLatBounds }) => {
      const bounds = geometry.reduce((b, c) => b.extend(c), new LngLatBounds(geometry[0]!, geometry[0]!));
      m.fitBounds(bounds, { padding: node ? fitPadding(node) : 60, duration: 800 });
    });
  }, [geometry, loaded]);

  useEffect(() => {
    const label = markers.current?.dropoff.getElement().querySelector('[data-label]');
    if (label) label.textContent = dropoffLabel;
  }, [dropoffLabel, loaded]);

  // Van movement (cheap: one marker + one small GeoJSON line).
  useEffect(() => {
    const m = map.current;
    if (!m || !loaded) return;
    markers.current?.van.setLngLat(van);
    (m.getSource('done') as GeoJSONSource | undefined)?.setData(lineCollection(done));
  }, [van, done, loaded]);

  // Explicit size: maplibre-gl.css sets the container to position:relative, so inset-based sizing
  // collapses to 0px height. The parent positions this box.
  return <div ref={container} className="size-full" aria-hidden="true" />;
}

/** Leave room for the floating mover card (top-left) and compass on wide screens. */
function fitPadding(node: HTMLElement) {
  const wide = node.clientWidth >= 720;
  return wide ? { top: 90, bottom: 70, left: 380, right: 120 } : { top: 230, bottom: 60, left: 40, right: 40 };
}
