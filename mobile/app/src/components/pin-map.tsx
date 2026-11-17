import { useEffect, useMemo, useRef, type ComponentRef } from 'react';
import { WebView } from 'react-native-webview';

import { parseMapCentre, pinMapHtml, type MapPoint } from '@/lib/pin-map-html';

/**
 * A map that can be moved, opened on `start`; `onMove` gets its centre each time it stops. A new
 * `target` (the device's location) moves it there.
 */
export function PinMap({ start, target, onMove }: { start: MapPoint; target: MapPoint | null; onMove: (centre: MapPoint) => void }) {
  // The page is made once: a new one would put the map back where it started.
  const html = useMemo(() => pinMapHtml(start), [start]);
  const view = useRef<ComponentRef<typeof WebView>>(null);
  const loaded = useRef(false);
  const send = (to: MapPoint) => view.current?.postMessage(JSON.stringify(to));
  useEffect(() => {
    if (target && loaded.current) send(target);
  }, [target]);
  return (
    <WebView
      ref={view}
      testID="pin-map"
      originWhitelist={['*']}
      source={{ html }}
      onLoadEnd={() => {
        loaded.current = true;
        // A location found while the page was loading.
        if (target) send(target);
      }}
      onMessage={(event) => {
        const centre = parseMapCentre(event.nativeEvent.data);
        if (centre) onMove(centre);
      }}
      style={{ flex: 1, backgroundColor: 'transparent' }}
    />
  );
}
