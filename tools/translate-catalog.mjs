#!/usr/bin/env node
/**
 * Перевод описаний каталога на русский: data/anime.json → synopsis (RU) + synopsisEn (оригинал).
 *
 * Запуск из корня проекта:
 *   node tools/translate-catalog.mjs --sample=18      пробный прогон: 18 тайтлов из разных жанров,
 *                                                     результат в tools/.cache/translate-sample.json
 *   node tools/translate-catalog.mjs                  перевести весь каталог и записать data/anime.json
 * Параметры:
 *   --provider=google|deepl   google — открытый веб-перевод Google без ключа (по умолчанию);
 *                             deepl — нужен ключ в переменной окружения DEEPL_API_KEY
 *   --batch=6                 сколько описаний отправлять одним запросом (меньше запросов — реже лимит)
 *   --delay=1500              начальная пауза между запросами, мс (после ответа 429 растёт сама)
 *   --limit=N                 перевести только первые N тайтлов (остальные остаются как есть)
 *   --force                   перевести заново, не глядя в кэш
 *   --out=path                куда писать результат (по умолчанию data/anime.json или файл пробы)
 *
 * Если переводчик упёрся в лимит и не отпустил, скрипт сохраняет всё готовое (кэш + data/anime.json,
 * где непереведённые описания остаются на английском) — просто запустите его ещё раз позже.
 *
 * Порядок работы с каталогом: tools/build-catalog.mjs пересобирает data/anime.json с английскими
 * описаниями — после него запустите этот скрипт. Готовые переводы берутся из кэша
 * tools/.cache/translations.json, поэтому повторный перевод занимает секунды.
 */
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.length ? v.join('=') : true];
}));
const PROVIDER = String(args.provider || 'google');
const BASE_DELAY = Math.max(300, parseInt(args.delay ?? 1500, 10));
const MAX_DELAY = 12000;
const BATCH_SIZE = Math.max(1, Math.min(20, parseInt(args.batch ?? 6, 10)));
const BATCH_CHARS = 4500;              // Google стабильно принимает ~5000 символов за запрос
const SAMPLE = args.sample ? parseInt(args.sample, 10) : 0;
const LIMIT = args.limit ? parseInt(args.limit, 10) : 0;
const FORCE = !!args.force;
const IN_FILE = path.join(ROOT, 'data', 'anime.json');
const OUT_FILE = path.resolve(ROOT, args.out || (SAMPLE ? 'tools/.cache/translate-sample.json' : 'data/anime.json'));
const CACHE_FILE = path.join(ROOT, 'tools', '.cache', 'translations.json');
const MAX_RETRIES = 8;

const t0 = Date.now();
const ts = () => `[${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s]`;
const log = (...a) => console.log(ts(), ...a);
const warn = (...a) => console.warn(ts(), '⚠️ ', ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CYRILLIC = /[а-яё]/i;

class LimitError extends Error {}

// ───────────────────────── кэш (перевод каждого описания отдельно) ─────────────────────────
let cache = {};
let cacheDirty = 0;
const keyOf = text => createHash('sha1').update(PROVIDER + '\n' + text).digest('hex');

async function loadCache() {
  if (existsSync(CACHE_FILE)) {
    try { cache = JSON.parse(await readFile(CACHE_FILE, 'utf8')); } catch { warn('кэш повреждён — начинаем заново'); cache = {}; }
  }
}
async function saveCache(force = false) {
  if (!cacheDirty || (!force && cacheDirty < 5)) return;
  await mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await writeFile(CACHE_FILE + '.tmp', JSON.stringify(cache));
  await rename(CACHE_FILE + '.tmp', CACHE_FILE);
  cacheDirty = 0;
}

// ───────────────────────── переводчики: массив текстов → массив переводов ─────────────────────────
const SEP = '\n\n';

async function requestGoogle(texts) {
  // Несколько описаний одним запросом через пустую строку; Google сохраняет абзацы
  const body = new URLSearchParams({ q: texts.map(t => t.replace(/\s*\n\s*/g, ' ')).join(SEP) });
  const res = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ru&dt=t', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body,
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) return { status: res.status, retryAfter: res.headers.get('retry-after') };
  const data = await res.json();
  const joined = (data?.[0] || []).map(seg => seg?.[0] || '').join('');
  return { status: 200, texts: joined.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean) };
}

async function requestDeepl(texts) {
  const key = process.env.DEEPL_API_KEY;
  if (!key) throw new Error('для --provider=deepl задайте переменную окружения DEEPL_API_KEY');
  const host = key.endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com';
  const res = await fetch(`https://${host}/v2/translate`, {
    method: 'POST',
    headers: { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: texts, source_lang: 'EN', target_lang: 'RU' }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) return { status: res.status, retryAfter: res.headers.get('retry-after') };
  const data = await res.json();
  return { status: 200, texts: (data?.translations || []).map(t => t.text) };
}

const request = { google: requestGoogle, deepl: requestDeepl }[PROVIDER];
if (!request) { console.error(`Неизвестный --provider=${PROVIDER}. Доступны: google, deepl`); process.exit(1); }

// ───────────────────────── запрос с паузами, повторами и подстройкой скорости ─────────────────────────
let delay = BASE_DELAY, lastAt = 0, requests = 0, fromCache = 0, limitHits = 0;

function tidy(ru) {
  return ru.replace(/\s+([,.!?;:])/g, '$1').replace(/\s{2,}/g, ' ').replace(/« /g, '«').replace(/ »/g, '»').trim();
}

async function callTranslator(texts) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const wait = lastAt + delay - Date.now();
    if (wait > 0) await sleep(wait);
    lastAt = Date.now();
    requests++;
    let r;
    try {
      r = await request(texts);
    } catch (err) {
      if (/DEEPL_API_KEY/.test(err.message)) throw err;
      const pause = Math.min(120000, 3000 * 2 ** (attempt - 1));
      warn(`сеть: ${err.name === 'TimeoutError' ? 'таймаут' : err.message}. Повтор ${attempt}/${MAX_RETRIES} через ${pause / 1000}с`);
      await sleep(pause);
      continue;
    }
    if (r.status === 200) {
      delay = Math.max(BASE_DELAY, Math.round(delay * 0.95)); // всё хорошо — понемногу ускоряемся обратно
      return r.texts;
    }
    if (r.status === 429 || r.status >= 500) {
      if (r.status === 429) {
        limitHits++;
        delay = Math.min(MAX_DELAY, delay * 2); // замедляемся насовсем, а не только на этот запрос
      }
      const pause = r.retryAfter ? (parseInt(r.retryAfter, 10) + 1) * 1000 : Math.min(300000, 30000 * 2 ** (attempt - 1));
      warn(`переводчик ответил ${r.status}${r.status === 429 ? ' (лимит)' : ''}. Ждём ${Math.round(pause / 1000)}с, повтор ${attempt}/${MAX_RETRIES}; пауза между запросами теперь ${(delay / 1000).toFixed(1)}с`);
      await sleep(pause);
      continue;
    }
    throw new Error(`переводчик ответил ${r.status}`);
  }
  throw new LimitError(`переводчик не отвечает после ${MAX_RETRIES} попыток (вероятно, лимит запросов)`);
}

/** Переводит пачку описаний; если абзацы перепутались — переводит эту пачку по одному. */
async function translateBatch(texts) {
  if (texts.length > 1) {
    const out = await callTranslator(texts);
    if (out.length === texts.length && out.every(t => CYRILLIC.test(t))) return out.map(tidy);
    warn(`пачка из ${texts.length}: вернулось ${out.length} абзацев вместо ${texts.length} — переводим по одному`);
  }
  const result = [];
  for (const t of texts) {
    const [ru] = await callTranslator([t]);
    if (!ru || !CYRILLIC.test(ru)) throw new Error('переводчик вернул пустой или нерусский текст');
    result.push(tidy(ru));
  }
  return result;
}

// ───────────────────────── выборка для пробы ─────────────────────────
function pickSample(anime, n) {
  const order = ['adventure', 'adventure', 'martial-arts', 'sci-fi', 'supernatural', 'romance', 'school', 'music',
    'psychological', 'horror', 'detective', 'drama', 'slice-of-life', 'realism', 'educational', 'fantasy', 'animals'];
  const picked = new Map();
  const hxh = anime.find(a => a.anilistId === 11061); // проверка исправленного заголовка
  if (hxh) picked.set(hxh.id, hxh);
  for (const g of order) {
    if (picked.size >= n) break;
    const a = anime.find(x => x.genres.includes(g) && !picked.has(x.id) && !(x.titleOriginal || '').startsWith('ONE PIECE'));
    if (a) picked.set(a.id, a);
  }
  return [...picked.values()].slice(0, n);
}

// ───────────────────────── основной проход ─────────────────────────
async function main() {
  const catalog = JSON.parse(await readFile(IN_FILE, 'utf8'));
  await loadCache();

  let items = catalog.anime;
  if (SAMPLE) items = pickSample(items, SAMPLE);
  else if (LIMIT) items = items.slice(0, LIMIT);

  // Оригинал храним в synopsisEn; при повторном запуске переводим именно его
  for (const a of items) {
    if (!a.synopsisEn && a.synopsis && !CYRILLIC.test(a.synopsis)) a.synopsisEn = a.synopsis;
  }
  const todo = [];
  for (const a of items) {
    if (!a.synopsisEn) continue;
    const cached = !FORCE && cache[keyOf(a.synopsisEn)];
    if (cached) { a.synopsis = cached; fromCache++; } else todo.push(a);
  }

  log(`Перевод описаний: ${items.length} тайтлов, из кэша ${fromCache}, осталось перевести ${todo.length}; ` +
      `переводчик ${PROVIDER}, пачки по ${BATCH_SIZE}, пауза от ${BASE_DELAY} мс`);

  let done = 0, failed = 0, stopped = null;
  for (let i = 0; i < todo.length;) {
    // собираем пачку, не превышая лимит символов
    const batch = [];
    let chars = 0;
    while (i < todo.length && batch.length < BATCH_SIZE && (chars + todo[i].synopsisEn.length <= BATCH_CHARS || !batch.length)) {
      chars += todo[i].synopsisEn.length; batch.push(todo[i]); i++;
    }
    try {
      const ru = await translateBatch(batch.map(a => a.synopsisEn));
      batch.forEach((a, k) => { a.synopsis = ru[k]; cache[keyOf(a.synopsisEn)] = ru[k]; });
      cacheDirty += batch.length;
      done += batch.length;
      await saveCache();
    } catch (err) {
      batch.forEach(a => { if (!CYRILLIC.test(a.synopsis || '')) a.synopsis = a.synopsisEn; });
      failed += batch.length;
      warn(`пачка «${batch[0].title}» и ещё ${batch.length - 1}: ${err.message}`);
      if (err instanceof LimitError || /DEEPL_API_KEY/.test(err.message) || failed >= 30) { stopped = err.message; break; }
    }
    if (done && (done % 60 < batch.length || i >= todo.length)) {
      log(`переведено ${done}/${todo.length} (запросов: ${requests}, лимит ловили: ${limitHits} раз, пауза ${(delay / 1000).toFixed(1)}с)`);
    }
  }
  await saveCache(true);

  // Всё, что не успели перевести, остаётся на английском (synopsis = synopsisEn), пустых нет
  for (const a of items) if (!a.synopsis && a.synopsisEn) a.synopsis = a.synopsisEn;

  const out = SAMPLE ? { sample: true, anime: items } : catalog;
  const ruCount = (SAMPLE ? items : catalog.anime).filter(a => CYRILLIC.test(a.synopsis || '')).length;
  if (!SAMPLE) {
    out.translation = { provider: PROVIDER, translatedAt: new Date().toISOString(), synopsisRu: ruCount, total: catalog.anime.length };
    out.source = { ...(out.source || {}), note: 'Описания переведены на русский автоматически; оригинал — в поле synopsisEn' };
  }
  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE + '.tmp', JSON.stringify(out, null, 2) + '\n', 'utf8');
  await rename(OUT_FILE + '.tmp', OUT_FILE); // атомарно

  log(`готово: переведено сейчас ${done}, взято из кэша ${fromCache}, ошибок ${failed}, запросов ${requests} → ${path.relative(ROOT, OUT_FILE)}`);
  log(`русских описаний в результате: ${ruCount} из ${(SAMPLE ? items : catalog.anime).length}`);
  if (stopped) { warn(`остановлено досрочно: ${stopped}. Готовое сохранено — запустите скрипт ещё раз позже, он продолжит с места остановки`); process.exitCode = 2; }
}

main().catch(err => { console.error(ts(), '❌', err.message); process.exitCode = 1; });
