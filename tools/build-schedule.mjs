#!/usr/bin/env node
/**
 * Расписание выхода аниме → data/schedule.json (раздел «График выхода» на pages/news.html).
 *
 *   node tools/build-schedule.mjs
 * Параметры:
 *   --ongoing=60    сколько онгоингов брать (самые популярные, у которых известна следующая серия)
 *   --upcoming=40   сколько премьер и сколько продолжений брать (каждого вида)
 *   --no-translate  не переводить (названия/описания без русского варианта останутся на английском)
 *
 * Источник — открытый GraphQL API AniList (ключ не нужен):
 *   • онгоинги      — status: RELEASING, у которых есть nextAiringEpisode (номер и время следующей серии);
 *   • премьеры      — status: NOT_YET_RELEASED, без связи PREQUEL (совершенно новые тайтлы);
 *   • продолжения   — status: NOT_YET_RELEASED, у которых есть PREQUEL (новые сезоны известных аниме).
 * Русские названия и описания берутся из data/anime.json (по anilistId); если тайтла там нет —
 * из русских синонимов AniList или ручного словаря tools/extra-titles.mjs, иначе переводятся
 * автоматически (Google, как в tools/translate-catalog.mjs; кэш — tools/.cache/schedule-translations.json).
 *
 * Расписание меняется каждую неделю — запускайте скрипт перед публикацией сайта.
 * Страница сама уточняет время следующих серий онгоингов прямо из AniList, если сеть доступна.
 */
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TITLE_OVERRIDES } from './title-overrides.mjs';
import { EXTRA_TITLES } from './extra-titles.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.length ? v.join('=') : true];
}));
const ONGOING_LIMIT = parseInt(args.ongoing ?? 60, 10);
const UPCOMING_LIMIT = parseInt(args.upcoming ?? 40, 10);
const TRANSLATE = !args['no-translate'];
const OUT = path.join(ROOT, 'data', 'schedule.json');
const CATALOG = path.join(ROOT, 'data', 'anime.json');
const TR_CACHE = path.join(ROOT, 'tools', '.cache', 'schedule-translations.json');
const DESC_MAX = 420;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('•', ...a);

// ───────── AniList ─────────
const FIELDS = `
  id idMal siteUrl format status episodes duration popularity averageScore
  season seasonYear
  startDate { year month day }
  title { romaji english native }
  synonyms genres
  studios(isMain: true) { nodes { name } }
  coverImage { extraLarge large }
  description(asHtml: false)
  nextAiringEpisode { airingAt episode }
  relations { edges { relationType node { id type title { romaji english } } } }`;

const QUERY = `
query ($page: Int, $status: MediaStatus) {
  Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage }
    media(type: ANIME, isAdult: false, status: $status, sort: [POPULARITY_DESC], format_in: [TV, TV_SHORT, ONA, MOVIE, OVA, SPECIAL]) { ${FIELDS} }
  }
}`;

let lastAt = 0;
async function gql(variables) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const wait = lastAt + 2200 - Date.now();
    if (wait > 0) await sleep(wait);
    lastAt = Date.now();
    let res;
    try {
      res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: QUERY, variables }),
        signal: AbortSignal.timeout(30000),
      });
    } catch (e) { await sleep(3000 * attempt); continue; }
    if (res.status === 429) { await sleep((parseInt(res.headers.get('retry-after') || '60', 10) + 1) * 1000); continue; }
    if (res.status >= 500) { await sleep(3000 * attempt); continue; }
    const body = await res.json();
    if (body.errors) throw new Error('AniList: ' + body.errors.map(e => e.message).join('; '));
    return body.data.Page;
  }
  throw new Error('AniList не ответил');
}

async function fetchStatus(status, pages) {
  const all = [];
  for (let page = 1; page <= pages; page++) {
    const p = await gql({ page, status });
    all.push(...p.media);
    log(`${status}: стр. ${page}, всего ${all.length}`);
    if (!p.pageInfo.hasNextPage) break;
  }
  return all;
}

// ───────── русские названия и тексты ─────────
const CYRILLIC = /[А-Яа-яЁё]/;
const NON_RUSSIAN_CYRILLIC = /[Ѐ-ӿ](?<![А-Яа-яЁё])/u;
const UKRAINIAN_HINTS = [
  /[А-Яа-яЁё]['’ʼ][А-Яа-яЁё]/u,
  /ць(?![\p{L}])/iu,
  /(?<![\p{L}])(та|що|це|від|який|яка|яке|які|його|вона|вони|між|після|через|навіть|також|ще|мене|тебе)(?![\p{L}])/iu,
];
const isRussianTitle = s => CYRILLIC.test(s) && !NON_RUSSIAN_CYRILLIC.test(s) && !UKRAINIAN_HINTS.some(rx => rx.test(s));

const GENRES_RU = {
  Action: 'Экшен', Adventure: 'Приключения', Comedy: 'Комедия', Drama: 'Драма', Ecchi: 'Этти', Fantasy: 'Фэнтези',
  Horror: 'Ужасы', 'Mahou Shoujo': 'Махо-сёдзё', Mecha: 'Меха', Music: 'Музыка', Mystery: 'Детектив',
  Psychological: 'Психология', Romance: 'Романтика', 'Sci-Fi': 'Фантастика', 'Slice of Life': 'Повседневность',
  Sports: 'Спорт', Supernatural: 'Сверхъестественное', Thriller: 'Триллер',
};

function decodeEntities(s) {
  return s.replace(/&(#\d+|#x[0-9a-f]+|amp|lt|gt|quot|apos|nbsp|mdash|ndash|hellip|rsquo|lsquo|rdquo|ldquo);/gi, (m, e) => {
    const map = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return map[e.toLowerCase()] ?? m;
  });
}
function cleanText(raw) {
  if (!raw) return '';
  let s = decodeEntities(String(raw).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''));
  s = s.replace(/\(\s*Source:[^)]*\)/gi, '').replace(/\[\s*Written by[^\]]*\]/gi, '').replace(/~!.*?!~/gs, '')
       .replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (s.length <= DESC_MAX) return s;
  const cut = s.slice(0, DESC_MAX);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return (end > DESC_MAX * 0.5 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…').trim();
}

// Перевод пачками через Google (как tools/translate-catalog.mjs), с кэшем
let trCache = {};
const trKey = t => createHash('sha1').update(t).digest('hex');
async function translateMany(texts) {
  const out = new Array(texts.length);
  const todo = [];
  texts.forEach((t, i) => {
    if (!t) out[i] = '';
    else if (trCache[trKey(t)]) out[i] = trCache[trKey(t)];
    else todo.push(i);
  });
  for (let k = 0; k < todo.length;) {
    const batch = [];
    let chars = 0;
    while (k < todo.length && batch.length < 6 && (chars + texts[todo[k]].length < 4200 || !batch.length)) {
      chars += texts[todo[k]].length; batch.push(todo[k]); k++;
    }
    const joined = batch.map(i => texts[i].replace(/\s*\n\s*/g, ' ')).join('\n\n');
    let parts = null;
    for (let attempt = 1; attempt <= 5 && !parts; attempt++) {
      try {
        const res = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ru&dt=t', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: new URLSearchParams({ q: joined }),
          signal: AbortSignal.timeout(45000),
        });
        if (res.ok) {
          const data = await res.json();
          const p = (data?.[0] || []).map(seg => seg?.[0] || '').join('').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
          if (p.length === batch.length) parts = p;
          else if (batch.length > 1) break; // абзацы склеились — переведём по одному ниже
        }
      } catch { /* повтор */ }
      if (!parts) await sleep(2000 * attempt);
    }
    if (!parts && batch.length > 1) { k -= batch.length; // по одному
      for (const i of batch) { const [r] = await translateMany([texts[i]]); out[i] = r; k++; }
      continue;
    }
    batch.forEach((i, j) => {
      const ru = parts ? parts[j].replace(/\s+([,.!?;:])/g, '$1').replace(/« /g, '«').replace(/ »/g, '»') : null;
      out[i] = ru && CYRILLIC.test(ru) ? ru : texts[i];
      if (ru && CYRILLIC.test(ru)) trCache[trKey(texts[i])] = ru;
    });
    await sleep(1200);
  }
  return out;
}

// Номер сезона по названию: «Season 2», «2nd Season», «Part 2», «… II», «… 3»
function seasonNumber(m) {
  const names = [m.title.english, m.title.romaji].filter(Boolean);
  for (const n of names) {
    const part = n.match(/\bpart\s*(\d+)/i) || n.match(/\bcour\s*(\d+)/i);
    let x = n.match(/season\s*(\d+)/i) || n.match(/(\d+)(?:st|nd|rd|th)\s*season/i);
    if (x) return part ? { season: +x[1], part: +part[1] } : { season: +x[1] };
    if (part) return { part: +part[1] };
    x = n.match(/\s(II|III|IV|V|VI)\b(?!.*\b(II|III|IV|V|VI)\b)/);
    if (x) return { season: { II: 2, III: 3, IV: 4, V: 5, VI: 6 }[x[1]] };
    x = n.match(/\s(\d{1,2})$/);
    if (x) return { season: +x[1] };
  }
  if (/final season/i.test(names.join(' '))) return { final: true };
  return null;
}

function hasPrequel(m) {
  return (m.relations?.edges || []).some(e => e.relationType === 'PREQUEL' && e.node.type === 'ANIME');
}
function prequelOf(m) {
  const e = (m.relations?.edges || []).find(e => e.relationType === 'PREQUEL' && e.node.type === 'ANIME');
  return e ? e.node : null;
}

async function main() {
  const catalog = JSON.parse(await readFile(CATALOG, 'utf8'));
  const byAnilist = new Map(catalog.anime.map(a => [a.anilistId, a]));
  if (existsSync(TR_CACHE)) { try { trCache = JSON.parse(await readFile(TR_CACHE, 'utf8')); } catch { trCache = {}; } }

  log('загружаем онгоинги…');
  const releasing = (await fetchStatus('RELEASING', 3)).filter(m => m.nextAiringEpisode && m.format !== 'MOVIE');
  log('загружаем анонсы…');
  const upcoming = await fetchStatus('NOT_YET_RELEASED', 4);

  const ongoing = releasing.slice(0, ONGOING_LIMIT);
  const premieres = upcoming.filter(m => !hasPrequel(m)).slice(0, UPCOMING_LIMIT);
  const sequels = upcoming.filter(hasPrequel).slice(0, UPCOMING_LIMIT);

  // Русские названия: каталог → ручной словарь → синонимы AniList → перевод
  const all = [...ongoing, ...premieres, ...sequels];
  const needTitle = [], needDesc = [];
  const ru = new Map();
  for (const m of all) {
    const cat = byAnilist.get(m.id);
    const title = (cat && cat.title !== (m.title.english || m.title.romaji) ? cat.title : null)
      || EXTRA_TITLES[m.id] || TITLE_OVERRIDES[m.id] || (m.synonyms || []).find(isRussianTitle) || null;
    const desc = cat && CYRILLIC.test(cat.synopsis || '') ? cat.synopsis : null;
    ru.set(m.id, { title, desc, auto: false });
    // переводим только английское название; ромадзи без английского варианта оставляем как есть
    if (!title && m.title.english) needTitle.push(m);
    if (!desc && m.description) needDesc.push(m);
  }
  if (TRANSLATE) {
    log(`переводим: названий ${needTitle.length}, описаний ${needDesc.length}…`);
    // СЛОВА КАПСОМ переводчик понимает плохо — приводим к обычному регистру
    const fixCaps = t => t.replace(/([A-Z][A-Z'’]{3,})/g, w => w[0] + w.slice(1).toLowerCase());
    const titles = await translateMany(needTitle.map(m => fixCaps(m.title.english)));
    needTitle.forEach((m, i) => { if (CYRILLIC.test(titles[i])) Object.assign(ru.get(m.id), { title: titles[i], auto: true }); });
    const descs = await translateMany(needDesc.map(m => cleanText(m.description)));
    needDesc.forEach((m, i) => { ru.get(m.id).desc = descs[i]; });
    await mkdir(path.dirname(TR_CACHE), { recursive: true });
    await writeFile(TR_CACHE, JSON.stringify(trCache));
  }

  const ruTitleOf = id => {
    const cat = byAnilist.get(id);
    return (cat && CYRILLIC.test(cat.title) ? cat.title : null) || (ru.get(id) && ru.get(id).title) || null;
  };

  // Продолжение известного тайтла: «<русское название франшизы> N» / «… N. Часть K»
  function franchiseBase(t) {
    return String(t || '').replace(/[.:,]?\s*(\d+(-?й)?\s*)?(?<!\p{L})(сезон|часть)(?!\p{L}).*$/iu, '')
      .replace(/\s+(\d+|[IVX]+)$/, '').replace(/[\s:.,—-]+$/, '').trim();
  }

  // Русское название франшизы из каталога — по общему началу английского/оригинального названия
  // («Tensei Shitara Slime Datta Ken 4th Season» → «О моём перерождении в слизь»)
  const norm = t => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const latinBase = t => norm(String(t || '').split(/:\s|\s[-–—]\s/)[0]
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\s+(the\s+)?(final\s+)?(\d+(st|nd|rd|th)\s+)?(season|part|cour|movie)\b.*$/i, '')
    .replace(/\s+(\d+|[ivx]+)$/i, ''));
  const franchiseIndex = new Map();
  for (const a of catalog.anime) { // каталог отсортирован по популярности — первым запоминаем самый известный тайтл
    if (!CYRILLIC.test(a.title)) continue;
    for (const t of [a.titleOriginal, a.titleEnglish]) {
      const k = latinBase(t);
      if (k.length >= 4 && !franchiseIndex.has(k)) franchiseIndex.set(k, franchiseBase(a.title));
    }
  }
  function franchiseRu(m) {
    for (const t of [m.title.romaji, m.title.english]) {
      const k = latinBase(t);
      if (k && franchiseIndex.has(k)) return franchiseIndex.get(k);
    }
    return null;
  }

  function sequelTitle(m) {
    const s = seasonNumber(m);
    if (!s || s.final) return null;
    const p = prequelOf(m);
    const pre = p ? ruTitleOf(p.id) : null;
    const base = (pre && CYRILLIC.test(pre) ? franchiseBase(pre) : null) || franchiseRu(m);
    if (!base) return null;
    const preNum = pre ? (pre.match(/\s(\d+)$/) || [])[1] : null;
    const season = s.season || (s.part ? preNum : null);
    return base + (season ? ' ' + season : '') + (s.part ? '. Часть ' + s.part : '');
  }

  // Машинный перевод иногда возвращает названия КАПСОМ — делаем обычный регистр
  const calmCaps = t => /[А-ЯЁ]{2,}\s+[А-ЯЁ]{2,}/.test(t)
    ? t.replace(/[А-ЯЁ]{2,}/g, w => w[0] + w.slice(1).toLowerCase())
    : t;

  function toItem(m, kind) {
    const cat = byAnilist.get(m.id);
    const r = ru.get(m.id) || {};
    // своё русское название продолжения надёжнее машинного перевода
    const seqTitle = (!r.title || r.auto) ? sequelTitle(m) : null;
    if (seqTitle) { r.title = seqTitle; r.auto = false; }
    const shownTitle = r.title ? (r.auto ? calmCaps(r.title) : r.title) : (m.title.english || m.title.romaji);
    const item = {
      anilistId: m.id,
      catalogId: cat ? cat.id : null,
      title: shownTitle,
      // русское название франшизы — подсказка для тайтлов без русского названия
      franchise: CYRILLIC.test(shownTitle) ? null : franchiseRu(m),
      titleAuto: !!r.auto,
      titleOriginal: m.title.romaji || null,
      titleEnglish: m.title.english || null,
      poster: m.coverImage?.extraLarge || m.coverImage?.large || null,
      format: m.format || null,
      studio: m.studios?.nodes?.[0]?.name || null,
      genres: (m.genres || []).map(g => GENRES_RU[g] || g),
      episodes: m.episodes || null,
      season: m.season || null,
      seasonYear: m.seasonYear || null,
      startDate: m.startDate && m.startDate.year ? m.startDate : null,
      popularity: m.popularity || 0,
      synopsis: r.desc || cleanText(m.description) || '',
      url: m.siteUrl,
    };
    if (m.nextAiringEpisode) { item.nextEpisode = m.nextAiringEpisode.episode; item.airingAt = m.nextAiringEpisode.airingAt; }
    if (kind === 'sequel') {
      const s = seasonNumber(m);
      if (s) item.sequel = s;
      const p = prequelOf(m);
      if (p) item.prequel = { anilistId: p.id, title: ruTitleOf(p.id) || p.title.english || p.title.romaji, catalogId: byAnilist.get(p.id)?.id || null };
    }
    return item;
  }

  // Онгоинги — по времени следующей серии; анонсы — по дате старта (неизвестные даты — в конце, по популярности)
  const dateKey = it => it.startDate ? (it.startDate.year * 10000 + (it.startDate.month || 13) * 100 + (it.startDate.day || 32)) : 99999999;
  const result = {
    generatedAt: new Date().toISOString(),
    source: { name: 'AniList GraphQL API', url: 'https://anilist.co', note: 'Русские названия и описания — из каталога сайта; для новых тайтлов переведены автоматически' },
    ongoing: ongoing.map(m => toItem(m, 'ongoing')).sort((a, b) => a.airingAt - b.airingAt),
    premieres: premieres.map(m => toItem(m, 'premiere')).sort((a, b) => dateKey(a) - dateKey(b) || b.popularity - a.popularity),
    sequels: sequels.map(m => toItem(m, 'sequel')).sort((a, b) => dateKey(a) - dateKey(b) || b.popularity - a.popularity),
  };

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT + '.tmp', JSON.stringify(result, null, 1) + '\n', 'utf8');
  await rename(OUT + '.tmp', OUT);
  log(`готово: онгоингов ${result.ongoing.length}, премьер ${result.premieres.length}, продолжений ${result.sequels.length} → data/schedule.json`);
  const inCatalog = [...result.ongoing, ...result.premieres, ...result.sequels].filter(i => i.catalogId).length;
  log(`из них уже есть в каталоге: ${inCatalog}; названий переведено автоматически: ${needTitle.length}`);
}

main().catch(err => { console.error('❌', err.message); process.exitCode = 1; });
