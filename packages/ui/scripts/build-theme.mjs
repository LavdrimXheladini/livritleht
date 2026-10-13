// Writes packages/ui/theme.css from tokens.json: `pnpm --filter @movershub/ui build:theme`.
// (scripts/dev-prep.mjs does the same before every start.)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildThemeCss } from '../src/theme-css.mjs';

const ui = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(ui, 'theme.css');
writeFileSync(out, buildThemeCss(JSON.parse(readFileSync(join(ui, 'tokens.json'), 'utf8'))));
console.log(`wrote ${out}`);
