#!/usr/bin/env node
/**
 * Inside catch blocks, replace setError(...) with toast.error(...) for action feedback.
 * Leaves load-time setError outside catch alone (inline banners for page state).
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../src', import.meta.url).pathname;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) walk(path, out);
    else if (/\.(tsx|ts)$/.test(name) && !name.includes('.test.')) out.push(path);
  }
  return out;
}

function extractCallArg(source, startIdx) {
  let depth = 1;
  let i = startIdx;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escaped = false;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (escaped) {
      escaped = false;
      i += 1;
      continue;
    }
    if (ch === '\\' && (inSingle || inDouble || inTemplate)) {
      escaped = true;
      i += 1;
      continue;
    }
    if (!inDouble && !inTemplate && ch === "'") inSingle = !inSingle;
    else if (!inSingle && !inTemplate && ch === '"') inDouble = !inDouble;
    else if (!inSingle && !inDouble && ch === '`') inTemplate = !inTemplate;
    else if (!inSingle && !inDouble && !inTemplate) {
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
    }
    i += 1;
  }
  return { arg: source.slice(startIdx, i - 1), end: i };
}

function findCatchBlocks(source) {
  const blocks = [];
  const re = /\bcatch\s*(?:\([^)]*\)|\s*)\s*\{/g;
  let match;
  while ((match = re.exec(source)) != null) {
    const start = match.index + match[0].length;
    let depth = 1;
    let i = start;
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    let escaped = false;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (escaped) {
        escaped = false;
        i += 1;
        continue;
      }
      if (ch === '\\' && (inSingle || inDouble || inTemplate)) {
        escaped = true;
        i += 1;
        continue;
      }
      if (!inDouble && !inTemplate && ch === "'") inSingle = !inSingle;
      else if (!inSingle && !inTemplate && ch === '"') inDouble = !inDouble;
      else if (!inSingle && !inDouble && ch === '`') inTemplate = !inTemplate;
      else if (!inSingle && !inDouble && !inTemplate) {
        if (ch === '{') depth += 1;
        else if (ch === '}') depth -= 1;
      }
      i += 1;
    }
    blocks.push({ start: match.index, bodyStart: start, end: i });
  }
  return blocks;
}

function replaceSetErrorInRange(source, from, to) {
  let out = source.slice(0, from);
  let cursor = from;
  let changed = false;
  const needle = 'setError(';
  while (cursor < to) {
    const idx = source.indexOf(needle, cursor);
    if (idx === -1 || idx >= to) {
      out += source.slice(cursor, to);
      break;
    }
    if (idx > 0 && /[A-Za-z0-9_$]/.test(source[idx - 1])) {
      out += source.slice(cursor, idx + needle.length);
      cursor = idx + needle.length;
      continue;
    }
    out += source.slice(cursor, idx);
    const { arg, end } = extractCallArg(source, idx + needle.length);
    const trimmed = arg.trim();
    if (trimmed === "''" || trimmed === '""') {
      out += '/* toast clear */ void 0';
    } else {
      out += `toast.error(${trimmed})`;
      changed = true;
    }
    cursor = end;
  }
  out += source.slice(to);
  return { source: out, changed };
}

function ensureToastImport(source) {
  if (source.includes("from '@/lib/toast'")) return source;
  const importRe = /^import[\s\S]*?;\s*$/gm;
  let lastIndex = 0;
  let match;
  while ((match = importRe.exec(source)) != null) {
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex === 0) return `import { toast } from '@/lib/toast';\n${source}`;
  return `${source.slice(0, lastIndex)}\nimport { toast } from '@/lib/toast';\n${source.slice(lastIndex)}`;
}

function migrateFile(path) {
  let source = readFileSync(path, 'utf8');
  if (!source.includes('setError(') || !source.includes('catch')) return false;

  const blocks = findCatchBlocks(source);
  if (blocks.length === 0) return false;

  let changed = false;
  // process from end so indexes stay valid
  for (let b = blocks.length - 1; b >= 0; b -= 1) {
    const block = blocks[b];
    const result = replaceSetErrorInRange(source, block.bodyStart, block.end - 1);
    if (result.changed) {
      source = result.source;
      changed = true;
    }
  }

  // Also migrate showLineReviewError / common actionError setters in catch via toast already covered
  if (!changed) return false;

  source = ensureToastImport(source);
  writeFileSync(path, source);
  console.log('migrated errors', relative(ROOT, path));
  return true;
}

let count = 0;
for (const file of walk(ROOT)) {
  if (migrateFile(file)) count += 1;
}
console.log(`Done. Migrated catch-errors in ${count} files.`);
