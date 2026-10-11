'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import type { Locale, Place } from '@ranktrip/shared';

import type { GeoSuggestion } from '@/lib/geo/types';

const MIN_CHARS = 3;
const DEBOUNCE_MS = 300;

type Status = 'idle' | 'searching' | 'done' | 'error';

/**
 * Address search (WAI-ARIA combobox). Suggestions come from our own /api/geo/search, which proxies
 * the geocoder server-side. Selecting a suggestion reports a Place; typing alone never does.
 */
export function AddressField({
  label,
  placeholder,
  name,
  value,
  onSelect,
  locale,
  near,
}: {
  label: string;
  placeholder: string;
  name: string;
  value: Place;
  onSelect: (place: Place) => void;
  locale: Locale;
  /** Bias results towards this point (e.g. the other address). */
  near?: { lat: number; lon: number };
}) {
  const { t } = useTranslation();
  const id = useId();
  const listId = `${id}-list`;
  const [text, setText] = useState(value.label);
  const [results, setResults] = useState<GeoSuggestion[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Value changed from outside (corridor pill, swap): show the new address.
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setText(value.label);
    setOpen(false);
  }

  const query = text.trim();
  const searching = open && query.length >= MIN_CHARS && query !== value.label;
  // Primitive key (not the object) so a new `near` object each render doesn't restart the search.
  const nearKey = near ? `${near.lat.toFixed(3)},${near.lon.toFixed(3)}` : '';

  useEffect(() => {
    if (!searching) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus('searching');
      const params = new URLSearchParams({ q: query, locale });
      if (nearKey) {
        const [lat, lon] = nearKey.split(',');
        params.set('lat', lat!);
        params.set('lon', lon!);
      }
      try {
        const res = await fetch(`/api/geo/search?${params}`, { signal: controller.signal });
        const body = (await res.json()) as { results: GeoSuggestion[] };
        if (!res.ok) throw new Error(String(res.status));
        setResults(body.results);
        setActive(body.results.length ? 0 : -1);
        setStatus('done');
      } catch {
        if (!controller.signal.aborted) setStatus('error');
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searching, query, locale, nearKey]);

  const choose = (s: GeoSuggestion) => {
    const place: Place = { label: s.label, area: s.area, district: s.district, lat: s.lat, lon: s.lon, countryCode: s.countryCode };
    setText(place.label);
    setOpen(false);
    setResults([]);
    onSelect(place);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!results.length) return;
      e.preventDefault();
      setOpen(true);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + results.length) % results.length);
    } else if (e.key === 'Enter' && open && results[active]) {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setText(value.label);
    }
  };

  const showList = open && query.length >= MIN_CHARS && query !== value.label && status !== 'idle';
  const optionId = (i: number) => `${id}-opt-${i}`;

  return (
    <div className="relative flex flex-[1_1_min(220px,100%)]">
      <label className="flex w-full flex-col gap-1.5 rounded-input bg-stone-200 px-4 py-3 focus-within:ring-2 focus-within:ring-brand-500">
        <span className="text-xs text-ink-600">{label}</span>
        <input
          name={name}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
          autoComplete="off"
          spellCheck={false}
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={onKeyDown}
          onBlur={() => {
            // Let a click on an option land before closing; then restore the chosen address.
            blurTimer.current = setTimeout(() => {
              setOpen(false);
              setText(value.label);
            }, 150);
          }}
          className="w-full truncate border-0 bg-transparent p-0 text-[17px] font-medium text-ink-900 outline-none placeholder:text-ink-500"
        />
      </label>

      {showList ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          onMouseDown={() => clearTimeout(blurTimer.current)}
          className="absolute top-[calc(100%+6px)] right-0 left-0 z-30 m-0 max-h-80 list-none overflow-auto rounded-input border border-stone-300 bg-stone-50 p-1.5 shadow-sheet"
        >
          {status === 'searching' && !results.length ? (
            <li className="px-3 py-2.5 text-sm text-ink-500">{t('landing.quote.searching')}</li>
          ) : status === 'error' ? (
            <li className="px-3 py-2.5 text-sm text-danger">{t('landing.quote.searchError')}</li>
          ) : !results.length ? (
            <li className="px-3 py-2.5 text-sm text-ink-500">{t('landing.quote.noResults')}</li>
          ) : (
            results.map((s, i) => {
              const [first, ...rest] = s.label.split(', ');
              return (
                <li
                  key={s.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(s)}
                  className="cursor-pointer rounded-md px-3 py-2.5 aria-selected:bg-stone-200"
                >
                  <div className="text-[15px] font-medium text-ink-900">{first}</div>
                  {rest.length ? <div className="text-[12.5px] text-ink-600">{rest.join(', ')}</div> : null}
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
