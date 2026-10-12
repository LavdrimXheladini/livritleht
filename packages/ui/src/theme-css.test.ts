import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import tokens from '../tokens.json';
import { buildThemeCss } from './theme-css';

describe('theme.css', () => {
  it('is in sync with tokens.json (run `pnpm --filter @movershub/ui build:theme`)', () => {
    const onDisk = readFileSync(join(__dirname, '..', 'theme.css'), 'utf8');
    expect(onDisk).toBe(buildThemeCss(tokens));
  });

  it('keeps the status colours', () => {
    expect(tokens.colors).toMatchObject({ success: '#1a7f37', warning: '#b25e00', danger: '#c62828' });
  });
});
