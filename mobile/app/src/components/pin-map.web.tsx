import { useEffect, useMemo, useState } from 'react';

import { parseMapCentre, pinMapHtml, type MapPoint } from '@/lib/pin-map-html';

/** The browser version of the map a place is pinned on (see pin-map.tsx): the same page, in a frame. */
export function PinMap({ start, onMove }: { start: MapPoint; onMove: (centre: MapPoint) => void }) {
  const html = useMemo(() => pinMapHtml(start), [start]);
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null);
  useEffect(() => {
    if (!frame) return;
    // Only this frame's own messages count.
    const listen = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) return;
      const centre = parseMapCentre(event.data);
      if (centre) onMove(centre);
    };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, [frame, onMove]);
  return (
    <iframe
      ref={setFrame}
      data-testid="pin-map"
      title="map"
      // Scripts only: the map's page gets its own empty origin — no access to the app's storage or session.
      sandbox="allow-scripts"
      srcDoc={html}
      style={{ border: 0, width: '100%', height: '100%', flex: 1 }}
    />
  );
}
