'use client';

import { useEffect } from 'react';

import { glideTo, sectionTop } from '@/lib/smooth-scroll';

/**
 * Same-page links (#markets, #quote …) glide to their section instead of jumping. One listener for
 * the whole page, so plain `<a href="#…">` links need nothing special. Links opened in a new tab,
 * with modifier keys, or already handled by a component keep the browser's behaviour.
 */
export function SmoothScroll() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== '_self')) return;
      const url = new URL(link.href);
      const here = window.location;
      if (!url.hash || url.origin !== here.origin || url.pathname !== here.pathname || url.search !== here.search) return;
      const section = document.getElementById(decodeURIComponent(url.hash.slice(1)));
      if (!section) return;

      e.preventDefault();
      // Same history entry as a normal anchor; keep Next.js's router state.
      if (url.hash !== here.hash) window.history.pushState(window.history.state, '', url.hash);
      glideTo(
        () => sectionTop(section),
        () => {
          // Like a real anchor: keyboard and screen-reader users continue from the section.
          if (!section.hasAttribute('tabindex')) section.setAttribute('tabindex', '-1');
          section.focus({ preventScroll: true });
        },
      );
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
  return null;
}
