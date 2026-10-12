'use client';

import 'maplibre-gl/dist/maplibre-gl.css';

import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';

import { colors } from '@movershub/ui';

import type { LineCoords } from '@/lib/geo/types';
import { lineCollection, loadMapLibre, markerElement, VAN_SVG } from '@/lib/map/load';

const VAN_BASE =
  'flex cursor-pointer items-center justify-center rounded-full border-0 text-ink-900 outline-none focus-visible:ring-2 focus-visible:ring-night-50 focus-visible:ring-offset-2 focus-visible:ring-offset-night-800';
const VAN_ON = `${VAN_BASE} size-10 bg-accent-500 motion-safe:animate-pulse-ring`;
const VAN_OFF = `${VAN_BASE} size-7.5 bg-sage-400`;
const END_ON = 'size-3 rounded-full border-3 border-night-800 bg-stone-50';
const END_OFF = `${END_ON} opacity-50`;

export type MapJob = { geometry: LineCoords; vanLabel: string };
export type MapPosition = { point: [number, number]; done: LineCoords };

/**
 * Dark map with every simulated job: dashed full route, travelled part, van marker (a button —
 * clicking it focuses the job) and drop-off dot. The selected job is copper and framed in view.
 * Pans by drag (two fingers on touch screens), zooms with the buttons or Ctrl + scroll.
 */
export function LiveMovesMap({
  jobs,
  positions,
  selected,
  onSelect,
  labels,
  onFail,
}: {
  jobs: readonly MapJob[];
  positions: readonly MapPosition[];
  selected: number;
  onSelect: (index: number) => void;
  labels: { zoomIn: string; zoomOut: string; gestureWindows: string; gestureMac: string; gestureMobile: string };
  onFail: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const vans = useRef<Marker[]>([]);
  const ends = useRef<Marker[]>([]);
  const [loaded, setLoaded] = useState(false);
  const latest = useRef({ jobs, positions, selected, onSelect, labels, onFail });
  useEffect(() => {
    latest.current = { jobs, positions, selected, onSelect, labels, onFail };
  });

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    let cancelled = false;

    void (async () => {
      try {
        const {
          lib: { Map, Marker, LngLatBounds },
          style,
        } = await loadMapLibre();
        if (cancelled) return;
        const { jobs: js, positions: ps, selected: sel, labels: l } = latest.current;
        const g = js[sel]!.geometry;
        const m = new Map({
          container: node,
          style,
          bounds: g.reduce((b, c) => b.extend(c), new LngLatBounds(g[0]!, g[0]!)),
          fitBoundsOptions: { padding: fitPadding(node) },
          cooperativeGestures: true,
          locale: {
            'CooperativeGesturesHandler.WindowsHelpText': l.gestureWindows,
            'CooperativeGesturesHandler.MacHelpText': l.gestureMac,
            'CooperativeGesturesHandler.MobileHelpText': l.gestureMobile,
          },
          dragRotate: false,
          pitchWithRotate: false,
          attributionControl: { compact: true },
        });
        map.current = m;

        m.on('load', () => {
          if (cancelled) return;
          latest.current.jobs.forEach((job, i) => {
            const on = i === latest.current.selected;
            m.addSource(`route-${i}`, { type: 'geojson', data: lineCollection(job.geometry) });
            m.addSource(`done-${i}`, { type: 'geojson', data: lineCollection(latest.current.positions[i]!.done) });
            m.addLayer({
              id: `route-${i}`,
              type: 'line',
              source: `route-${i}`,
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: { 'line-color': on ? colors.night[400] : colors.night[600], 'line-width': 3, 'line-dasharray': [0.7, 2.3] },
            });
            m.addLayer({
              id: `done-${i}`,
              type: 'line',
              source: `done-${i}`,
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: { 'line-color': on ? colors.accent[500] : colors.night[300], 'line-width': on ? 4 : 2.5 },
            });
          });
          setLoaded(true);
        });
        m.on('error', (e) => console.warn('map error', e.error?.message));

        ends.current = js.map((job, i) =>
          new Marker({ element: markerElement(i === sel ? END_ON : END_OFF) })
            .setLngLat(job.geometry[job.geometry.length - 1]!)
            .addTo(m),
        );
        vans.current = js.map((job, i) => {
          const button = markerElement(i === sel ? VAN_ON : VAN_OFF, VAN_SVG, 'button');
          button.setAttribute('type', 'button');
          button.setAttribute('aria-label', job.vanLabel);
          button.setAttribute('aria-pressed', String(i === sel));
          button.addEventListener('click', (e) => {
            e.stopPropagation();
            latest.current.onSelect(i);
          });
          return new Marker({ element: button }).setLngLat(ps[i]!.point).addTo(m);
        });
      } catch (e) {
        console.warn('map unavailable', e);
        if (!cancelled) latest.current.onFail();
      }
    })();

    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      vans.current = [];
      ends.current = [];
    };
  }, []);

  // Selection: restyle routes + markers, frame the selected route.
  useEffect(() => {
    const m = map.current;
    if (!m || !loaded) return;
    jobs.forEach((_, i) => {
      const on = i === selected;
      m.setPaintProperty(`route-${i}`, 'line-color', on ? colors.night[400] : colors.night[600]);
      m.setPaintProperty(`done-${i}`, 'line-color', on ? colors.accent[500] : colors.night[300]);
      m.setPaintProperty(`done-${i}`, 'line-width', on ? 4 : 2.5);
      if (on) {
        m.moveLayer(`route-${i}`);
        m.moveLayer(`done-${i}`);
      }
      const van = vans.current[i]?.getElement();
      if (van) {
        swapClasses(van, on ? VAN_OFF : VAN_ON, on ? VAN_ON : VAN_OFF);
        van.style.zIndex = on ? '3' : '2';
        van.setAttribute('aria-pressed', String(on));
      }
      const end = ends.current[i]?.getElement();
      if (end) swapClasses(end, on ? END_OFF : END_ON, on ? END_ON : END_OFF);
    });
    const g = jobs[selected]!.geometry;
    const node = container.current;
    void import('maplibre-gl').then(({ LngLatBounds }) => {
      m.fitBounds(
        g.reduce((b, c) => b.extend(c), new LngLatBounds(g[0]!, g[0]!)),
        { padding: node ? fitPadding(node) : 60, duration: 900 },
      );
    });
  }, [selected, jobs, loaded]);

  // Movement: one marker + one small line per job.
  useEffect(() => {
    const m = map.current;
    if (!m || !loaded) return;
    positions.forEach((p, i) => {
      vans.current[i]?.setLngLat(p.point);
      (m.getSource(`done-${i}`) as GeoJSONSource | undefined)?.setData(lineCollection(p.done));
    });
  }, [positions, loaded]);

  return (
    <>
      <div ref={container} className="size-full" />
      <div className="absolute right-4 bottom-14 z-10 flex flex-col gap-1.5">
        <ZoomButton label={labels.zoomIn} onClick={() => map.current?.zoomIn()}>
          +
        </ZoomButton>
        <ZoomButton label={labels.zoomOut} onClick={() => map.current?.zoomOut()}>
          −
        </ZoomButton>
      </div>
    </>
  );
}

function ZoomButton({ label, onClick, children }: { label: string; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="press size-10 cursor-pointer rounded-md border border-night-600 bg-night-700 text-lg text-night-50 hover:border-night-400"
    >
      {children}
    </button>
  );
}

/** Replace our Tailwind classes without touching the ones MapLibre adds (maplibregl-marker …). */
function swapClasses(node: HTMLElement, from: string, to: string) {
  node.classList.remove(...from.split(' '));
  node.classList.add(...to.split(' '));
}

/** Keep the selected route clear of the floating job card (top-left) and the compass / zoom (right). */
function fitPadding(node: HTMLElement) {
  const wide = node.clientWidth >= 640;
  return wide ? { top: 70, bottom: 60, left: 400, right: 130 } : { top: 390, bottom: 50, left: 40, right: 70 };
}
