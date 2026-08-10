#!/usr/bin/env node
/**
 * Migrate per-page setSuccess action banners to global toast.success.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../src', import.meta.url).pathname;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) walk(path, out);
    else if (/\.(tsx|ts|jsx|js)$/.test(name) && !name.includes('.test.')) out.push(path);
  }
  return out;
}

function extractCallArg(source, startIdx) {
  // startIdx points at char after '('
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
    if (!inDouble && !inTemplate && ch === "'") {
      inSingle = !inSingle;
    } else if (!inSingle && !inTemplate && ch === '"') {
      inDouble = !inDouble;
    } else if (!inSingle && !inDouble && ch === '`') {
      inTemplate = !inTemplate;
    } else if (!inSingle && !inDouble && !inTemplate) {
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
    }
    i += 1;
  }
  return { arg: source.slice(startIdx, i - 1), end: i };
}

function replaceSetterCalls(source, setterName, toastMethod) {
  let out = '';
  let cursor = 0;
  let changed = false;
  const needle = `${setterName}(`;
  while (cursor < source.length) {
    const idx = source.indexOf(needle, cursor);
    if (idx === -1) {
      out += source.slice(cursor);
      break;
    }
    // skip if part of identifier (e.g. mySetSuccess)
    if (idx > 0 && /[A-Za-z0-9_$]/.test(source[idx - 1])) {
      out += source.slice(cursor, idx + needle.length);
      cursor = idx + needle.length;
      continue;
    }
    out += source.slice(cursor, idx);
    const { arg, end } = extractCallArg(source, idx + needle.length);
    const trimmed = arg.trim();
    if (trimmed === "''" || trimmed === '""' || trimmed === '``' || trimmed === 'null') {
      out += '/* toast clear */ void 0';
    } else {
      out += `toast.${toastMethod}(${trimmed})`;
      changed = true;
    }
    cursor = end;
  }
  return { source: out, changed };
}

function ensureToastImport(source) {
  if (source.includes("from '@/lib/toast'") || source.includes('from "@/lib/toast"')) {
    return source;
  }
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
  const original = source;
  if (
    !source.includes('setSuccess(') &&
    !source.includes('setSuccessMessage(') &&
    !source.includes('setSaveToast(')
  ) {
    return false;
  }
  if (path.endsWith('/toast.ts') || path.endsWith('/ToastProvider.tsx')) return false;

  let any = false;
  for (const [setter, method] of [
    ['setSuccess', 'success'],
    ['setSuccessMessage', 'success'],
    ['setSaveToast', 'success'],
  ]) {
    const result = replaceSetterCalls(source, setter, method);
    source = result.source;
    any = any || result.changed || source.includes('/* toast clear */ void 0');
  }

  // Remove green success banners
  source = source.replace(
    /\s*\{success\s*\?\s*<p className="rounded-xl bg-green-50[^>]*>\{success\}<\/p>\s*:\s*null\}/g,
    '',
  );
  source = source.replace(
    /\s*\{successMessage\s*\?\s*<p className="rounded-xl bg-green-50[^>]*>\{successMessage\}<\/p>\s*:\s*null\}/g,
    '',
  );
  source = source.replace(
    /\s*\{success\s*\?\s*\(\s*<div className="fixed bottom-6 right-6[\s\S]*?\{success\}\s*<\/div>\s*\)\s*:\s*null\}/g,
    '',
  );
  source = source.replace(
    /\s*\{saveToast\s*\?\s*\(\s*<div className="fixed bottom-6 right-6[\s\S]*?\{saveToast\}\s*<\/div>\s*\)\s*:\s*null\}/g,
    '',
  );

  // Remove unused state if value no longer referenced
  if (!/\{success\}/.test(source) && !/success\s*\?/.test(source) && !/\bsuccess\s*&&/.test(source)) {
    source = source.replace(/\s*const \[success,\s*setSuccess\] = useState\((['"`])[^'"`]*\1\);?/g, '');
  }
  if (!/\{successMessage\}/.test(source) && !/successMessage\s*\?/.test(source)) {
    source = source.replace(
      /\s*const \[successMessage,\s*setSuccessMessage\] = useState\((['"`])[^'"`]*\1\);?/g,
      '',
    );
  }
  if (!/\{saveToast\}/.test(source) && !/saveToast\s*\?/.test(source)) {
    source = source.replace(/\s*const \[saveToast,\s*setSaveToast\] = useState<[^>]+>\([^)]*\);?/g, '');
    source = source.replace(/\s*const \[saveToast,\s*setSaveToast\] = useState\((['"`])[^'"`]*\1\);?/g, '');
  }

  source = source.replace(
    /window\.setTimeout\(\(\) => \/\* toast clear \*\/ void 0, \d+\);?/g,
    '',
  );

  if (source.includes('toast.success(') || source.includes('toast.error(')) {
    source = ensureToastImport(source);
  }

  if (source !== original) {
    writeFileSync(path, source);
    console.log('migrated', relative(ROOT, path));
    return true;
  }
  return false;
}

let count = 0;
for (const file of walk(ROOT)) {
  if (migrateFile(file)) count += 1;
}
console.log(`Done. Migrated ${count} files.`);
