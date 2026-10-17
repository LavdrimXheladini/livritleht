import { describe, expect, it } from 'vitest';

import { directionsUrl } from './directions';

describe('open in maps', () => {
  const place = { lat: 42.6629, lon: 21.1655 };

  it("opens the phone's own maps app with the place as the destination, coordinates only", () => {
    expect(directionsUrl(place, 'android')).toBe('geo:42.662900,21.165500?q=42.662900,21.165500');
    expect(directionsUrl(place, 'ios')).toBe('https://maps.apple.com/?daddr=42.662900,21.165500&dirflg=d');
    expect(directionsUrl(place, 'web')).toBe('https://www.google.com/maps/dir/?api=1&destination=42.662900%2C21.165500&travelmode=driving');
  });

  it('names no start or stops on the way — how to drive is the mover’s business (COMPLIANCE §2)', () => {
    for (const os of ['android', 'ios', 'web'] as const) {
      const url = directionsUrl({ lat: -1.5, lon: 0.1234567 }, os);
      expect(url).toContain(os === 'web' ? '-1.500000%2C0.123457' : '-1.500000,0.123457');
      expect(url).not.toMatch(/origin|waypoints|saddr/);
    }
  });
});
