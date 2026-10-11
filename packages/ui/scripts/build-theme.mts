import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import tokens from '../tokens.json' with { type: 'json' };
import { buildThemeCss } from '../src/theme-css.ts';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'theme.css');
writeFileSync(out, buildThemeCss(tokens));
console.log(`wrote ${out}`);
