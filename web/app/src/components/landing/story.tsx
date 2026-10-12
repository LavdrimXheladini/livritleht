'use client';

import { useState, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Card, Sheet } from '@movershub/ui/web';

const PHRASES = ['mov', 'veh', 'pri', 'pay', 'trk', 'dia'] as const;
type Phrase = (typeof PHRASES)[number];

/** Underlined phrase; <Trans> injects the translated words as children. Stable type → no remounts. */
function PhraseButton({
  id,
  active,
  onActivate,
  children,
}: {
  id: Phrase;
  active: boolean;
  onActivate: (id: Phrase) => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-controls="story-preview"
      onMouseEnter={() => onActivate(id)}
      onFocus={() => onActivate(id)}
      onClick={() => onActivate(id)}
      className={
        '-mx-0.5 cursor-pointer rounded-[3px] border-0 px-0.5 py-0 font-[inherit] text-inherit decoration-[1.5px] underline-offset-5 transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
        (active ? 'bg-brand-500 text-stone-50 no-underline' : 'bg-transparent underline')
      }
    >
      {children}
    </button>
  );
}

/** Paragraph with underlined phrases; hovering/focusing one swaps the preview card below. */
export function Story() {
  const { t } = useTranslation();
  const [active, setActive] = useState<Phrase>('mov');

  const components = Object.fromEntries(
    PHRASES.map((id) => [id, <PhraseButton key={id} id={id} active={active === id} onActivate={setActive} />]),
  );

  return (
    <Sheet tone="paper" padding="roomy">
      <div className="mx-auto max-w-[760px]">
        <p className="m-0 text-[clamp(22px,2.4vw,30px)] leading-[1.45] tracking-[-0.01em]">
          <Trans i18nKey="landing.story.text" components={components} />
        </p>
        <Card variant="inset" id="story-preview" aria-live="polite" className="mt-9 flex max-w-[520px] items-center gap-4.5">
          <div className="flex h-16 w-21 shrink-0 items-center justify-center rounded-md bg-night-700">
            <span className="size-3 rounded-full bg-accent-500" />
          </div>
          <div>
            <div className="text-[15px] font-semibold">{t(`landing.story.${active}.title`)}</div>
            <div className="mt-0.75 text-[13.5px] leading-[1.45] text-ink-600">{t(`landing.story.${active}.text`)}</div>
          </div>
        </Card>
      </div>
    </Sheet>
  );
}
