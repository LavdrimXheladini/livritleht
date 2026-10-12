import { useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Reads `message` out when it appears or changes — the phone's stand-in for the website's
 * role="alert" / aria-live: on iOS and Android those props announce nothing. Nothing = silent.
 */
export function useAnnouncement(message: string | null | undefined) {
  useEffect(() => {
    if (message) AccessibilityInfo.announceForAccessibility(message);
  }, [message]);
}
