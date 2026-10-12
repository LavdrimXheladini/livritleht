#!/usr/bin/env node
// Copies the pricing engine and shared code into supabase/functions/_shared/movershub/ so the Deno
// edge functions use the SAME code as the apps and tests. Only import paths change: Deno needs file
// extensions (`./x` → `./x.ts`) and doesn't know our workspace names (`@movershub/shared` → relative
// path). `zod` stays a bare import, mapped to npm:zod in each function's deno.json. The output is
// git-ignored; `pnpm functions:deploy` runs this first.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, sep } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, 'supabase', 'functions', '_shared', 'movershub');
const PACKAGES = [
  { name: '@movershub/shared', src: join(ROOT, 'packages', 'shared', 'src'), out: join(OUT, 'shared') },
  { name: '@movershub/pricing', src: join(ROOT, 'packages', 'pricing', 'src'), out: join(OUT, 'pricing') },
];
/** Bare imports allowed in function code (each must be mapped in the function's deno.json). */
const ALLOWED_BARE = new Set(['zod']);

const toPosix = (p) => p.split(sep).join(posix.sep);
const relativeImport = (fromFile, toFile) => {
  const rel = toPosix(relative(dirname(fromFile), toFile));
  return rel.startsWith('.') ? rel : `./${rel}`;
};

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts') ? [path] : [];
  });
}

function rewrite(code, srcFile, outFile, pkg) {
  return code.replace(/(\bfrom\s*|\bimport\s*\(?\s*)(['"])([^'"]+)\2/g, (match, lead, quote, spec) => {
    let target;
    if (spec.startsWith('.')) {
      const base = join(dirname(srcFile), spec);
      const file = [`${base}.ts`, join(base, 'index.ts')].find((f) => existsSync(f));
      if (!file) throw new Error(`${relative(ROOT, srcFile)}: cannot resolve "${spec}"`);
      target = relativeImport(outFile, join(pkg.out, relative(pkg.src, file)));
    } else {
      const dep = PACKAGES.find((p) => p.name === spec);
      if (dep) target = relativeImport(outFile, join(dep.out, 'index.ts'));
      else if (ALLOWED_BARE.has(spec)) return match;
      else throw new Error(`${relative(ROOT, srcFile)}: "${spec}" is not available in edge functions`);
    }
    return `${lead}${quote}${target}${quote}`;
  });
}

rmSync(OUT, { recursive: true, force: true });
let count = 0;
for (const pkg of PACKAGES) {
  for (const srcFile of sourceFiles(pkg.src)) {
    const outFile = join(pkg.out, relative(pkg.src, srcFile));
    mkdirSync(dirname(outFile), { recursive: true });
    const header = `// GENERATED from ${toPosix(relative(ROOT, srcFile))} by scripts/build-functions-shared.mjs — do not edit.\n`;
    writeFileSync(outFile, header + rewrite(readFileSync(srcFile, 'utf8'), srcFile, outFile, pkg));
    count++;
  }
}
console.log(`functions: copied ${count} shared files to ${toPosix(relative(ROOT, OUT))}`);
