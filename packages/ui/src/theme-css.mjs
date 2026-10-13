// @ts-check
// Generates packages/ui/theme.css (Tailwind 4 @theme) from tokens.json. Plain JavaScript (checked by
// TypeScript through these comments), so every Node version the project supports runs it as is:
// scripts/dev-prep.mjs does before every start. After editing tokens.json:
// `pnpm --filter @movershub/ui build:theme`.

/** @typedef {typeof import('../tokens.json')} Tokens */

/** @param {number} n */
const px = (n) => `${n}px`;

/**
 * @param {Tokens['colors']} colors
 * @returns {string[]}
 */
function colorVars(colors) {
  return Object.entries(colors).flatMap(([name, value]) =>
    typeof value === 'string'
      ? [`--color-${name}: ${value};`]
      : Object.entries(value).map(([step, hex]) => `--color-${name}-${step}: ${hex};`),
  );
}

/**
 * @param {Tokens} t
 * @returns {string}
 */
export function buildThemeCss(t) {
  const { display, wordmark, size } = t.typography;
  const theme = [
    ...colorVars(t.colors),
    '',
    ...Object.entries(t.radius).map(([k, v]) => `--radius-${k}: ${px(v)};`),
    '',
    ...Object.entries(t.shadow).map(([k, v]) => `--shadow-${k}: ${v};`),
    '',
    // next/font exposes --font-archivo / --font-geist / --font-geist-mono on <html>.
    `--font-display: var(--font-archivo), "${t.fonts.display}", ui-sans-serif, system-ui, sans-serif;`,
    `--font-sans: var(--font-geist), "${t.fonts.body}", ui-sans-serif, system-ui, sans-serif;`,
    `--font-mono: var(--font-geist-mono), "${t.fonts.mono}", ui-monospace, monospace;`,
    '',
    `--text-hero: ${size.hero};`,
    `--text-hero--line-height: ${display.leading};`,
    `--text-hero--letter-spacing: ${display.tracking};`,
    `--text-section: ${size.section};`,
    `--text-section--line-height: 1;`,
    `--text-section--letter-spacing: ${display.tracking};`,
    '',
    `--spacing-gutter: ${px(t.spacing.gutter)};`,
  ];

  return [
    '/* GENERATED from packages/ui/tokens.json — do not edit. Run `pnpm --filter @movershub/ui build:theme`. */',
    '',
    '@theme {',
    ...theme.map((l) => (l ? `  ${l}` : '')),
    '}',
    '',
    '/* Archivo display: stretched width, semibold, tight tracking. */',
    '@utility type-display {',
    '  font-family: var(--font-display);',
    `  font-stretch: ${display.stretch}%;`,
    `  font-variation-settings: "wdth" ${display.stretch};`,
    `  font-weight: ${display.weight};`,
    `  letter-spacing: ${display.tracking};`,
    // line-height comes from the size utility (text-hero 0.95, text-section 1) or is set per use.
    '}',
    '',
    '@utility type-wordmark {',
    '  font-family: var(--font-display);',
    `  font-stretch: ${wordmark.stretch}%;`,
    `  font-variation-settings: "wdth" ${wordmark.stretch};`,
    `  font-weight: ${wordmark.weight};`,
    `  letter-spacing: ${wordmark.tracking};`,
    '}',
    '',
  ].join('\n');
}
