import { createElement } from 'react';
import { View } from 'react-native';

import { routeMapHtml, type LonLat } from '@/lib/route-map-html';

/** The browser version of the move's map (see route-map.tsx): the same page, in a frame. */
export function RouteMap({ line, bottomPadding }: { line: readonly LonLat[]; bottomPadding: number }) {
  return (
    <View aria-hidden pointerEvents="none" className="flex-1 bg-stone-200">
      {createElement('iframe', {
        'data-testid': 'route-map',
        title: 'map',
        tabIndex: -1,
        // Scripts only: the map's page gets its own empty origin — no access to the app's storage or session.
        sandbox: 'allow-scripts',
        srcDoc: routeMapHtml(line, bottomPadding),
        style: { border: 0, width: '100%', height: '100%' },
      })}
    </View>
  );
}
