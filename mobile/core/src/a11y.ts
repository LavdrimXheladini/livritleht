import { useEffect } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Reads `message` out when it appears or changes — the phone's stand-in for the website's
 * role="alert" / aria-live: on iOS and Android those props announce nothing. Nothing = silent.
 * `repeatKey` (e.g. an attempt counter) reads the same message again on every new attempt.
 */
export function useAnnouncement(message: string | null | undefined, repeatKey?: unknown) {
  useEffect(() => {
    if (!message) return;
    if (Platform.OS === 'web') announceOnWeb(message);
    else AccessibilityInfo.announceForAccessibility(message);
  }, [message, repeatKey]);
}

/*
 * The browser version (the installable computer app): react-native-web's announceForAccessibility
 * does nothing, so messages go into one visually hidden live region. It exists from the start —
 * screen readers often miss a region that appears together with its first message — and messages
 * that arrive together are read as one, instead of the second replacing the first.
 */
const REGION_ID = 'a11y-announcer';

function liveRegion(): HTMLElement | null {
  if (typeof document === 'undefined' || !document.body) return null;
  let region = document.getElementById(REGION_ID);
  if (!region) {
    region = document.createElement('div');
    region.id = REGION_ID;
    region.setAttribute('aria-live', 'assertive');
    region.setAttribute('aria-atomic', 'true');
    Object.assign(region.style, {
      position: 'absolute',
      width: '1px',
      height: '1px',
      margin: '-1px',
      padding: '0',
      overflow: 'hidden',
      clip: 'rect(0 0 0 0)',
      whiteSpace: 'nowrap',
      border: '0',
    });
    document.body.appendChild(region);
  }
  return region;
}

if (Platform.OS === 'web') liveRegion();

let queued: string[] = [];
let flush: ReturnType<typeof setTimeout> | undefined;

function announceOnWeb(message: string) {
  const region = liveRegion();
  if (!region) return;
  queued.push(message);
  if (flush) return;
  // Emptied first, so the same message is read again when it comes back.
  region.textContent = '';
  flush = setTimeout(() => {
    region.textContent = queued.join(' ');
    queued = [];
    flush = undefined;
  }, 100);
}
