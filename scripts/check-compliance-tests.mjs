#!/usr/bin/env node
// Keeps COMPLIANCE-TESTS.md honest (run by `pnpm test`, so also in CI):
//   1. every rule in COMPLIANCE.md §13 has a row, with the rule's exact text;
//   2. every test a row names still exists: the file is there and contains the title.
// Tests are named as `path/to/file` › `test title` (titles in backticks: some contain quotes).
// A rule that is not built yet names its build step instead of tests.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');

const section = read('COMPLIANCE.md').split(/^## /m).find((s) => s.startsWith('13.'));
if (!section) throw new Error('COMPLIANCE.md has no "## 13." section');
const rules = [...section.matchAll(/^- \[[ x]\] (.+)$/gm)].map((m) => m[1].trim());

// Table rows: | rule | status | tests |
const rows = new Map(
  read('COMPLIANCE-TESTS.md')
    .split('\n')
    .filter((line) => line.startsWith('| ') && !line.startsWith('| §13') && !line.startsWith('|---'))
    .map((line) => line.split(' | ').map((cell) => cell.replace(/^\| ?| ?\|$/g, '').trim()))
    .map(([rule, status, tests]) => [rule, { status, tests: tests ?? '' }]),
);

const problems = [];
for (const rule of rules) {
  const row = rows.get(rule);
  if (!row) {
    problems.push(`missing row for: ${rule}`);
    continue;
  }
  const refs = [...row.tests.matchAll(/`([^`]+)` › `([^`]+)`/g)];
  if (!row.status.startsWith('not built') && refs.length === 0) problems.push(`no tests named for: ${rule}`);
  for (const [, file, title] of refs) {
    if (!existsSync(join(ROOT, file))) problems.push(`${file} does not exist (${rule})`);
    // SQL doubles apostrophes inside test names ('a mover''s login').
    else if (!read(file).replace(/''/g, "'").includes(title)) problems.push(`${file} has no test "${title}" (${rule})`);
  }
}
for (const rule of rows.keys()) if (!rules.includes(rule)) problems.push(`row is not a §13 rule (text changed?): ${rule}`);

if (problems.length) {
  console.error(`COMPLIANCE-TESTS.md is out of date:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`COMPLIANCE-TESTS.md: all ${rules.length} rules of COMPLIANCE.md §13 mapped; every named test exists.`);
