// "Open in maps" for the accepted mover (design/DECISIONS.md #36): a destination for the phone's own
// maps app — coordinates only, never the customer's name or directions in the link, and never a route
// MoversHub chooses (COMPLIANCE §2: how to drive is the mover's business).

export type DirectionsOs = 'android' | 'ios' | 'web';

const fixed = (n: number) => n.toFixed(6);

/** A link that opens the phone's maps app (or Google Maps on the web) with this place as the destination. */
export function directionsUrl({ lat, lon }: { lat: number; lon: number }, os: DirectionsOs): string {
  const at = `${fixed(lat)},${fixed(lon)}`;
  if (os === 'android') return `geo:${at}?q=${at}`;
  if (os === 'ios') return `https://maps.apple.com/?daddr=${at}&dirflg=d`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(at)}&travelmode=driving`;
}
