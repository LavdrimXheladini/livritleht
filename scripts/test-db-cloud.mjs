#!/usr/bin/env node
// Runs the pgTAP tests against the LINKED cloud project without Docker — and leaves nothing behind.
//
// Everything (the pgTAP extension, migrations not pushed yet, the tests and their fixtures) runs in
// ONE transaction that always ends with an error, so Postgres rolls all of it back. The error
// message carries the TAP output. Uses `supabase db query --linked` (Management API: no Docker,
// no database password).
//
//   node scripts/test-db-cloud.mjs                       # all of supabase/tests/database
//   node scripts/test-db-cloud.mjs supabase/tests/database/movers.test.sql
//
// Test files are normal pgTAP files (begin; plan; …; finish; rollback). Their SELECTs must return a
// single text column (every pgTAP assertion does).

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const TESTS = join(ROOT, 'supabase', 'tests', 'database');
const MARKER = 'TAP-ROLLBACK';
const FILE_DONE = 'ranktrip-test-file-done';

/** Run SQL on the linked project. Always via a file: the npm shim needs a shell on Windows, which would split inline SQL. */
function runSql(sql) {
  const dir = mkdtempSync(join(tmpdir(), 'ranktrip-dbtest-'));
  const file = join(dir, 'query.sql');
  writeFileSync(file, sql);
  try {
    const out = execFileSync('supabase', ['db', 'query', '--linked', '--output-format', 'json', '--agent', 'no', '-f', file], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ''}
${e.stderr ?? ''}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Split SQL into statements on `;`, respecting comments, quotes and dollar-quoted bodies. */
export function splitSql(sql) {
  const statements = [];
  let buf = '';
  let i = 0;
  const take = (end) => {
    buf += sql.slice(i, end);
    i = end;
  };
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === '-' && next === '-') {
      const end = sql.indexOf('\n', i);
      take(end === -1 ? sql.length : end);
    } else if (ch === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      take(end === -1 ? sql.length : end + 2);
    } else if (ch === "'") {
      const escapes = /[eE]/.test(sql[i - 1] ?? '') && !/[\w$]/.test(sql[i - 2] ?? '');
      let j = i + 1;
      while (j < sql.length) {
        if (escapes && sql[j] === '\\') j += 2;
        else if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") break;
        else j++;
      }
      take(Math.min(j + 1, sql.length));
    } else if (ch === '"') {
      const end = sql.indexOf('"', i + 1);
      take(end === -1 ? sql.length : end + 1);
    } else if (ch === '$' && /^\$([A-Za-z_]\w*)?\$/.test(sql.slice(i))) {
      const tag = /^\$([A-Za-z_]\w*)?\$/.exec(sql.slice(i))[0];
      const end = sql.indexOf(tag, i + tag.length);
      take(end === -1 ? sql.length : end + tag.length);
    } else if (ch === ';') {
      if (buf.trim()) statements.push(buf.trim());
      buf = '';
      i++;
    } else {
      buf += ch;
      i++;
    }
  }
  if (buf.trim()) statements.push(buf.trim());
  return statements;
}

/** The statement without leading comments, to classify it. */
const head = (stmt) => stmt.replace(/^(\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*/, '');

function quote(stmt, n) {
  const tag = `$rt${n}q$`;
  if (stmt.includes(tag)) throw new Error(`statement ${n} contains the quoting tag ${tag}`);
  return `${tag}${stmt}${tag}`;
}

function buildBlock(migrationFiles, testFiles) {
  const lines = [];
  let n = 0;
  const step = (label) => lines.push(`  _step := ${quote(label, ++n)};`);
  for (const file of migrationFiles) {
    splitSql(readFileSync(file, 'utf8')).forEach((stmt, k) => {
      if (/^(begin|commit|rollback)\b/i.test(head(stmt))) return;
      step(`${relative(ROOT, file)} #${k + 1}`);
      lines.push(`  execute ${quote(stmt, ++n)};`);
    });
  }
  for (const file of testFiles) {
    lines.push(`  _out := _out || ${quote(`# ${relative(ROOT, file)}\n`, ++n)};`);
    // Each file runs in its own sub-transaction, rolled back at its end (like a separate pg_prove
    // run): fixtures, role, JWT claims and pgTAP's plan never leak into the next file.
    lines.push('  begin');
    splitSql(readFileSync(file, 'utf8')).forEach((stmt, k) => {
      const h = head(stmt);
      if (/^(begin|commit|rollback)\b/i.test(h)) return;
      step(`${relative(ROOT, file)} #${k + 1}: ${h.slice(0, 80).replace(/\s+/g, ' ')}`);
      if (/^select\b/i.test(h)) {
        lines.push(`  for _r in execute ${quote(stmt, ++n)} loop`);
        lines.push(`    if _r ~ '^(ok |not ok |1\\.\\.|#)' then _out := _out || _r || E'\\n'; end if;`);
        lines.push('  end loop;');
      } else {
        lines.push(`  execute ${quote(stmt, ++n)};`);
      }
    });
    lines.push(
      `    raise exception '${FILE_DONE}';`,
      '  exception when others then',
      `    if sqlerrm <> '${FILE_DONE}' then raise; end if;`,
      '  end;',
    );
  }
  return `do $runner$
declare
  _out text := '';
  _r text;
  _step text := 'setup';
begin
  set local search_path = public, extensions;
  create extension if not exists pgtap with schema extensions;
${lines.join('\n')}
  raise exception '${MARKER}%', E'\\n' || _out;
exception when others then
  if sqlerrm like '${MARKER}%' then raise; end if;
  raise exception 'FAILED at %: % [%]', _step, sqlerrm, sqlstate;
end
$runner$;
`;
}

/** Pull the database's error message out of the CLI output (JSON nested in JSON). */
function errorMessage(out) {
  for (const candidate of [out, ...out.split('\n')]) {
    try {
      const parsed = JSON.parse(candidate.trim());
      const msg = parsed?.error?.message ?? parsed?.message;
      if (typeof msg !== 'string') continue;
      const inner = msg.indexOf('{');
      if (inner !== -1) {
        try {
          return JSON.parse(msg.slice(inner)).message ?? msg;
        } catch {
          return msg;
        }
      }
      return msg;
    } catch {
      // not JSON — try the next candidate
    }
  }
  return out.replace(/\\\\n/g, '\n').replace(/\\n/g, '\n');
}

// ── main ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const sqlFilesIn = (dir) => readdirSync(dir).filter((f) => f.endsWith('.test.sql')).sort().map((f) => join(dir, f));
const testFiles = args.length
  ? args.flatMap((a) => {
      const path = join(process.cwd(), a);
      return statSync(path).isDirectory() ? sqlFilesIn(path) : [path];
    })
  : sqlFilesIn(TESTS);

const applied = runSql('select version from supabase_migrations.schema_migrations order by version;');
if (!applied.ok) {
  console.error('Could not read the migration history of the linked project:\n' + applied.out);
  process.exit(1);
}
const appliedVersions = new Set(JSON.parse(applied.out).map((r) => r.version));
const pending = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql') && !appliedVersions.has(f.split('_')[0]))
  .sort()
  .map((f) => join(MIGRATIONS, f));

console.log(pending.length ? `Applying ${pending.length} unpushed migration(s) inside the test transaction:` : 'No unpushed migrations.');
pending.forEach((f) => console.log(`  ${relative(ROOT, f)}`));
console.log(`Running ${testFiles.length} test file(s) on the linked project (everything is rolled back)…\n`);

const result = runSql(buildBlock(pending, testFiles));

const message = errorMessage(result.out);
if (result.ok || !message.includes(MARKER)) {
  console.error(result.ok ? 'Unexpected: the test transaction did not roll back.' : message.split('\nCONTEXT:')[0]);
  process.exit(1);
}

const tap = message.slice(message.indexOf(MARKER) + MARKER.length).split('\nCONTEXT:')[0].trim();
console.log(tap);

// Per file: the plan must match the number of results, and nothing may fail.
let failed = 0;
for (const block of tap.split(/^# /m).filter(Boolean)) {
  const plan = Number(/^1\.\.(\d+)/m.exec(block)?.[1] ?? NaN);
  const results = block.match(/^(ok|not ok) \d+/gm) ?? [];
  const bad = results.filter((r) => r.startsWith('not ok')).length;
  if (bad || results.length !== plan) {
    failed++;
    console.error(`\n✗ ${block.split('\n')[0]}: ${bad} failed, ${results.length} of ${plan} planned ran`);
  }
}
console.log(failed ? '' : '\n✓ All database tests passed (and were rolled back).');
process.exit(failed ? 1 : 0);
