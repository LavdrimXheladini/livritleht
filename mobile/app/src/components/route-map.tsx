import { View } from 'react-native';
import { WebView } from 'react-native-webview';

import { routeMapHtml, type LonLat } from '@/lib/route-map-html';

/**
 * A move's map: the road from the pickup to the drop-off. Decorative — the addresses are in the text
 * below — so it is hidden from screen readers and takes no touches.
 */
export function RouteMap({ line, bottomPadding }: { line: readonly LonLat[]; bottomPadding: number }) {
  return (
    <View aria-hidden pointerEvents="none" className="flex-1 bg-stone-200">
      <WebView
        testID="route-map"
        originWhitelist={['*']}
        source={{ html: routeMapHtml(line, bottomPadding) }}
        scrollEnabled={false}
        style={{ flex: 1, backgroundColor: 'transparent' }}
      />
    </View>
  );
}
