'use client';

import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import { glideTo } from '@/lib/smooth-scroll';
import { cn } from '@/lib/utils';

/** Shown once the visitor has scrolled about one screen down. */
const SHOW_AFTER_PX = 600;

function subscribe(onChange: () => void) {
  window.addEventListener('scroll', onChange, { passive: true });
  return () => window.removeEventListener('scroll', onChange);
}

/** Small round arrow, bottom-right, that glides back to the top of the page. */
export function BackToTop() {
  const { t } = useTranslation();
  const visible = useSyncExternalStore(
    subscribe,
    () => window.scrollY > SHOW_AFTER_PX,
    () => false,
  );

  const toTop = () =>
    glideTo(
      () => 0,
      // Keyboard users continue from the top of the page, not from this (now hidden) button.
      () => document.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus({ preventScroll: true }),
    );

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label={t('common.backToTop')}
      title={t('common.backToTop')}
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      className={cn(
        'press fixed right-4 bottom-4 z-50 flex size-11 cursor-pointer items-center justify-center rounded-full border border-stone-50/15 bg-ink-900 text-stone-50 shadow-device transition-[opacity,translate] duration-300 hover:bg-brand-500 sm:right-6 sm:bottom-6',
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0',
      )}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 19V5" />
        <path d="m5 12 7-7 7 7" />
      </svg>
    </button>
  );
}
