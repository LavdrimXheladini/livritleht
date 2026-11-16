import { useMemo } from 'react';
import { WebView } from 'react-native-webview';

import { parseMapCentre, pinMapHtml, type MapPoint } from '@/lib/pin-map-html';

/** A map that can be moved, opened on `start`; `onMove` gets its centre each time it stops. */
export function PinMap({ start, onMove }: { start: MapPoint; onMove: (centre: MapPoint) => void }) {
  // The page is made once: a new one would put the map back where it started.
  const html = useMemo(() => pinMapHtml(start), [start]);
  return (
    <WebView
      testID="pin-map"
      originWhitelist={['*']}
      source={{ html }}
      onMessage={(event) => {
        const centre = parseMapCentre(event.nativeEvent.data);
        if (centre) onMove(centre);
      }}
      style={{ flex: 1, backgroundColor: 'transparent' }}
    />
  );
}
