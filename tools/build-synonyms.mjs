#!/usr/bin/env node
/* Альтернативные названия тайтлов для поиска на сайте → data/anime-synonyms.json
 *
 *   node tools/build-synonyms.mjs
 *
 * Берёт синонимы из ответов AniList, которые tools/build-catalog.mjs сохранил в tools/.cache/anilist,
 * и сопоставляет их с тайтлами data/anime.json по anilistId. Сеть не нужна.
 * Оставляет только названия латиницей и русской кириллицей (японские, тайские, арабские и т. п.
 * варианты для поиска на русскоязычном сайте бесполезны) и убирает повторы основных названий.
 *
 * Формат: { "<id тайтла>": ["синоним", ...], ... } — только тайтлы, у которых что-то нашлось.
 * Обиходные русские названия, которых нет в AniList («Ветролом» и т. п.), — в словаре ALIASES
 * в js/anime-search.js.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'tools', '.cache', 'anilist');
const CATALOG = join(ROOT, 'data', 'anime.json');
const OUT = join(ROOT, 'data', 'anime-synonyms.json');

const normalize = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Латиница (с диакритикой) или русский алфавит; цифры и знаки препинания разрешены
const LATIN_ONLY = /^[\p{Script=Latin}\p{N}\p{P}\p{S}\s]+$/u;
const RUSSIAN_ONLY = /^[А-Яа-яЁё\p{N}\p{P}\p{S}\s]+$/u;
const HAS_LETTER = /\p{L}/u;

// synonyms из всех закэшированных страниц AniList: anilistId → [..]
const synonymsByAnilist = new Map();
for (const file of readdirSync(CACHE)) {
  if (!file.endsWith('.json')) continue;
  let page;
  try { page = JSON.parse(readFileSync(join(CACHE, file), 'utf8')); } catch { continue; }
  const media = page?.data?.Page?.media || [];
  for (const m of media) {
    if (Array.isArray(m.synonyms) && m.synonyms.length) synonymsByAnilist.set(m.id, m.synonyms);
  }
}

const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));
const out = {};
let total = 0;
for (const a of catalog.anime) {
  const raw = synonymsByAnilist.get(a.anilistId) || [];
  const seen = new Set([a.title, a.titleEnglish, a.titleOriginal].map(normalize));
  const keep = [];
  for (const s of raw) {
    const name = String(s).trim();
    if (!HAS_LETTER.test(name) || name.length < 2) continue;
    if (!LATIN_ONLY.test(name) && !RUSSIAN_ONLY.test(name)) continue;
    const key = normalize(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keep.push(name);
  }
  if (keep.length) { out[a.id] = keep; total += keep.length; }
}

writeFileSync(OUT, JSON.stringify(out));
console.log(`Тайтлов с синонимами: ${Object.keys(out).length} из ${catalog.anime.length}, синонимов: ${total}`);
console.log(`Записано: ${OUT}`);
