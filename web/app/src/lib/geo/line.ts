import { haversineM, type LineCoords } from './types';

export type AlongResult = {
  /** [lon, lat] at the requested progress. */
  point: [number, number];
  /** The travelled part of the line, ending at `point`. */
  done: LineCoords;
  /** Compass bearing of the current segment, degrees clockwise from north. */
  bearing: number;
};

const toLatLon = ([lon, lat]: [number, number]) => ({ lat, lon });

function bearingDeg(a: [number, number], b: [number, number]): number {
  const r = Math.PI / 180;
  const [lon1, lat1] = [a[0] * r, a[1] * r];
  const [lon2, lat2] = [b[0] * r, b[1] * r];
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Position at fraction `t` (0…1) of a line's real length. */
export function alongLine(line: LineCoords, t: number): AlongResult {
  const first = line[0];
  if (!first) throw new Error('alongLine: empty line');
  if (line.length === 1) return { point: first, done: [first], bearing: 0 };
  const last = line[line.length - 1]!;
  // Exact end (summing segment lengths would land a rounding error short of the drop-off).
  if (t >= 1) return { point: last, done: [...line], bearing: bearingDeg(line[line.length - 2]!, last) };

  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    const d = haversineM(toLatLon(line[i - 1]!), toLatLon(line[i]!));
    seg.push(d);
    total += d;
  }
  let goal = total * Math.min(1, Math.max(0, t));
  const done: LineCoords = [first];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const d = seg[i - 1]!;
    if (goal <= d) {
      const f = d ? goal / d : 0;
      const point: [number, number] = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      done.push(point);
      return { point, done, bearing: bearingDeg(a, b) };
    }
    goal -= d;
    done.push(b);
  }
  return { point: last, done, bearing: bearingDeg(line[line.length - 2]!, last) };
}

export const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export const compassPoint = (bearing: number) => COMPASS[Math.round(bearing / 45) % 8]!;
