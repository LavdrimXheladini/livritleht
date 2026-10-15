import { useTranslation } from 'react-i18next';

import type { CancellationTerms } from '@movershub/shared';

/**
 * A mover's cancellation terms as customers read them: "Free cancellation until 48 hours before the
 * arrival time. Later: 50% of the mover's price." (design/DECISIONS.md #26). The mover's own screen
 * shows the same sentences, so they know exactly what customers see.
 */
export function useCancellationText(): (terms: CancellationTerms) => string {
  const { t } = useTranslation();
  return ({ freeHours, latePct }) => {
    const late = latePct === 0 ? t('booking.cancel.late0') : latePct === 100 ? t('booking.cancel.late100') : t('booking.cancel.late', { pct: latePct });
    return `${t(`booking.cancel.free${freeHours}`)} ${late}`;
  };
}
