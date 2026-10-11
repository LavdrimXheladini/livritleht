// Visible, eased page scrolling for same-page links and "back to top". The browser's own smooth
// scroll crosses a long page so fast that it reads as a jump; this one takes its time.

/** Duration grows with distance: ~0.6 s for a screen, at most 1.6 s across the whole page. */
export const glideDuration = (distancePx: number) => Math.min(1600, 500 + Math.abs(distancePx) * 0.22);

const easeInOutCubic = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

let stopCurrent: (() => void) | null = null;

/**
 * Glide the window to `getTop()` (read every frame, so late layout changes are followed).
 * Jumps instead when the visitor prefers reduced motion. Wheel, touch or keys hand control back.
 */
export function glideTo(getTop: () => number, onDone?: () => void) {
  stopCurrent?.();
  const clamp = (y: number) => Math.max(0, Math.min(y, document.documentElement.scrollHeight - window.innerHeight));
  const start = window.scrollY;
  const distance = clamp(getTop()) - start;

  if (Math.abs(distance) < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.scrollTo(0, clamp(getTop()));
    onDone?.();
    return;
  }

  const duration = glideDuration(distance);
  const t0 = performance.now();
  let frame = 0;
  const stop = () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('wheel', stop);
    window.removeEventListener('touchstart', stop);
    window.removeEventListener('keydown', stop);
    stopCurrent = null;
  };
  window.addEventListener('wheel', stop, { passive: true });
  window.addEventListener('touchstart', stop, { passive: true });
  window.addEventListener('keydown', stop);

  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / duration);
    const end = clamp(getTop());
    window.scrollTo(0, start + (end - start) * easeInOutCubic(p));
    if (p < 1) {
      frame = requestAnimationFrame(step);
    } else {
      stop();
      onDone?.();
    }
  };
  frame = requestAnimationFrame(step);
  stopCurrent = stop;
}

/** Page offset where a section starts, honouring its CSS scroll-margin-top. */
export function sectionTop(el: Element): number {
  const margin = Number.parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  return el.getBoundingClientRect().top + window.scrollY - margin;
}
