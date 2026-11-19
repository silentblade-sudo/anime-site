#!/usr/bin/env node
/**
 * Сборщик каталога аниме для сайта → data/anime.json
 *
 * Источник: открытый GraphQL API AniList (https://graphql.anilist.co), ключ не нужен.
 * (Jikan/MyAnimeList из этой сети недоступен — соединение с api.jikan.moe не устанавливается.)
 *
 * Запуск из корня проекта:
 *   node tools/build-catalog.mjs
 * Параметры:
 *   --per-genre=100        сколько тайтлов набирать на каждый жанр сайта (по умолчанию 100)
 *   --only=drama,horror    собрать только эти жанры (ключи из tools/genre-map.mjs)
 *   --out=data/anime.json  куда сохранить результат
 *   --delay=2100           пауза между запросами, мс (AniList сейчас допускает ~30 запросов в минуту)
 *   --fresh                не брать ответы из кэша tools/.cache/, скачать заново
 *
 * Жанры сайта и их соответствие жанрам/тегам API — в tools/genre-map.mjs.
 */
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENRE_MAP, MIN_TAG_RANK } from './genre-map.mjs';
import { TITLE_OVERRIDES } from './title-overrides.mjs';

// ───────────────────────── настройки ─────────────────────────
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.length ? v.join('=') : true];
}));
const PER_GENRE = Math.max(1, parseInt(args['per-genre'] ?? 100, 10));
const OUT_FILE = path.resolve(ROOT, args.out ?? 'data/anime.json');
const DELAY_MS = Math.max(700, parseInt(args.delay ?? 2100, 10));
const FRESH = !!args.fresh;
const ONLY = args.only ? String(args.only).split(',').map(s => s.trim()) : null;

const API_URL = 'https://graphql.anilist.co';
const PER_PAGE = 50;                // максимум AniList
const MAX_PAGES_PER_SOURCE = 8;     // защита от бесконечной пагинации
const MAX_RETRIES = 6;
const CACHE_DIR = path.join(ROOT, 'tools', '.cache', 'anilist');
const PLACEHOLDER = 'img/poster-placeholder.svg'; // путь от корня сайта
const SYNOPSIS_MAX = 480;

// ───────────────────────── логи ─────────────────────────
const t0 = Date.now();
const ts = () => `[${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s]`;
const log = (...a) => console.log(ts(), ...a);
const warn = (...a) => console.warn(ts(), '⚠️ ', ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ───────────────────────── запросы к API ─────────────────────────
let lastRequestAt = 0;
let requestsMade = 0;
let cacheHits = 0;

async function gql(query, variables, { cacheable = true } = {}) {
  const key = createHash('sha1').update(query + JSON.stringify(variables)).digest('hex');
  const cacheFile = path.join(CACHE_DIR, key + '.json');
  if (cacheable && !FRESH && existsSync(cacheFile)) {
    cacheHits++;
    return JSON.parse(await readFile(cacheFile, 'utf8'));
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // Держим паузу между запросами, чтобы не упираться в лимит (429)
    const wait = lastRequestAt + DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    requestsMade++;

    let res, body;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(30000),
      });
      body = await res.json().catch(() => null);
    } catch (err) {
      const pause = Math.min(60000, 2000 * 2 ** (attempt - 1));
      warn(`сеть: ${err.name === 'TimeoutError' ? 'таймаут' : err.message}. Повтор ${attempt}/${MAX_RETRIES} через ${pause / 1000}с`);
      await sleep(pause);
      continue;
    }

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('retry-after') || '60', 10);
      warn(`лимит запросов (429). Ждём ${retryAfter}с и повторяем (${attempt}/${MAX_RETRIES})`);
      await sleep((retryAfter + 1) * 1000);
      continue;
    }
    if (res.status >= 500) {
      const pause = Math.min(60000, 3000 * 2 ** (attempt - 1));
      warn(`сервер ответил ${res.status}. Повтор ${attempt}/${MAX_RETRIES} через ${pause / 1000}с`);
      await sleep(pause);
      continue;
    }
    if (!res.ok || !body || body.errors) {
      const msg = body?.errors?.map(e => e.message).join('; ') || `HTTP ${res.status}`;
      throw new Error(`AniList: ${msg}`);
    }

    // Мягкое торможение, если API сообщает, что запросов почти не осталось
    const remaining = parseInt(res.headers.get('x-ratelimit-remaining') ?? '99', 10);
    if (remaining <= 2) {
      warn(`осталось ${remaining} запросов в минуту — делаем паузу 30с`);
      await sleep(30000);
    }

    if (cacheable) {
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(cacheFile, JSON.stringify(body));
    }
    return body;
  }
  throw new Error(`AniList не ответил после ${MAX_RETRIES} попыток`);
}

const PAGE_QUERY = `
query ($page: Int, $perPage: Int, $genre: String, $tag: String, $minTagRank: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { currentPage hasNextPage }
    media(type: ANIME, isAdult: false, genre: $genre, tag: $tag, minimumTagRank: $minTagRank,
          format_not_in: [MUSIC], sort: [POPULARITY_DESC]) {
      id idMal siteUrl format seasonYear episodes averageScore popularity
      title { romaji english native }
      synonyms genres
      tags { name rank isMediaSpoiler }
      coverImage { extraLarge large }
      description(asHtml: false)
    }
  }
}`;

// ───────────────────────── приведение к формату сайта ─────────────────────────
const CYRILLIC = /[А-Яа-яЁё]/;

// В синонимах AniList русские названия перемешаны с украинскими, казахскими и т. п.
// Русским считаем только то, что набрано русским алфавитом и не похоже на украинский.
const NON_RUSSIAN_CYRILLIC = /[Ѐ-ӿ](?<![А-Яа-яЁё])/u;            // і ї є ґ ў ә қ ң ө ү ұ һ …
const UKRAINIAN_HINTS = [
  /[А-Яа-яЁё]['’ʼ][А-Яа-яЁё]/u,                                          // апостроф внутри слова: «Полум'яні»
  /ць(?![\p{L}])/iu,                                                     // окончание «-ць»: «Мисливець», «убивць»
  /(?<![\p{L}])(та|що|це|від|який|яка|яке|які|його|вона|вони|між|після|через|навіть|також|ще|мене|тебе)(?![\p{L}])/iu,
];
function isRussianTitle(s) {
  return CYRILLIC.test(s) && !NON_RUSSIAN_CYRILLIC.test(s) && !UKRAINIAN_HINTS.some(rx => rx.test(s));
}
function pickRussianTitle(media) {
  if (TITLE_OVERRIDES[media.id]) return TITLE_OVERRIDES[media.id];
  return (media.synonyms || []).find(isRussianTitle) || null;
}

function slugify(s) {
  return String(s || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60).replace(/-+$/, '') || 'anime';
}

function decodeEntities(s) {
  return s.replace(/&(#\d+|#x[0-9a-f]+|amp|lt|gt|quot|apos|nbsp|mdash|ndash|hellip|rsquo|lsquo|rdquo|ldquo);/gi, (m, e) => {
    const map = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return map[e.toLowerCase()] ?? m;
  });
}

function cleanSynopsis(raw) {
  if (!raw) return '';
  let s = decodeEntities(String(raw).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''));
  s = s.replace(/\(\s*Source:[^)]*\)/gi, '').replace(/\[\s*Written by[^\]]*\]/gi, '')
       .replace(/~!.*?!~/gs, '') // спойлеры AniList
       .replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (s.length <= SYNOPSIS_MAX) return s;
  const cut = s.slice(0, SYNOPSIS_MAX);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return (end > SYNOPSIS_MAX * 0.5 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…').trim();
}

/** Все разделы сайта, к которым относится тайтл (по его жанрам и тегам с весом ≥ MIN_TAG_RANK). */
function siteGenresFor(media) {
  const genres = new Set(media.genres || []);
  const tags = new Set((media.tags || []).filter(t => t.rank >= MIN_TAG_RANK && !t.isMediaSpoiler).map(t => t.name));
  return GENRE_MAP
    .filter(g => g.sources.some(s => (s.genre && genres.has(s.genre)) || (s.tag && tags.has(s.tag))))
    .map(g => g.key);
}

function toSiteItem(media) {
  const ru = pickRussianTitle(media);
  const title = ru || media.title.english || media.title.romaji || media.title.native;
  return {
    id: `${slugify(media.title.english || media.title.romaji)}-${media.id}`,
    title,
    titleOriginal: media.title.romaji || null,
    titleEnglish: media.title.english || null,
    genres: siteGenresFor(media),
    poster: media.coverImage?.extraLarge || media.coverImage?.large || PLACEHOLDER,
    synopsis: cleanSynopsis(media.description),
    year: media.seasonYear || null,
    format: media.format || null,
    episodes: media.episodes || null,
    score: media.averageScore ?? null,
    popularity: media.popularity ?? 0,
    anilistId: media.id,
    malId: media.idMal || null,
    url: media.siteUrl,
  };
}

// ───────────────────────── проверка таблицы соответствия ─────────────────────────
async function validateMap(map) {
  const body = await gql('{ GenreCollection MediaTagCollection { name isAdult } }', {});
  const genres = new Set(body.data.GenreCollection);
  const tags = new Set(body.data.MediaTagCollection.filter(t => !t.isAdult).map(t => t.name));
  let ok = true;
  for (const g of map) for (const s of g.sources) {
    if (s.genre && !genres.has(s.genre)) { warn(`«${g.name}»: жанра «${s.genre}» нет в AniList`); ok = false; }
    if (s.tag && !tags.has(s.tag)) { warn(`«${g.name}»: тега «${s.tag}» нет в AniList`); ok = false; }
  }
  if (!ok) throw new Error('Исправьте названия в tools/genre-map.mjs');
  log(`таблица соответствия проверена: ${map.length} жанров сайта, имена жанров и тегов совпадают с AniList`);
}

// ───────────────────────── сбор ─────────────────────────
async function main() {
  const map = ONLY ? GENRE_MAP.filter(g => ONLY.includes(g.key)) : GENRE_MAP;
  if (!map.length) throw new Error(`нет жанров по --only=${args.only}. Доступны: ${GENRE_MAP.map(g => g.key).join(', ')}`);

  log(`Сборщик каталога: ${map.length} жанров × ~${PER_GENRE} тайтлов, источник AniList, пауза ${DELAY_MS} мс${FRESH ? ', без кэша' : ''}`);
  await validateMap(map);

  const byId = new Map();        // anilistId → media (общий пул без дублей)
  const fetchedFor = {};         // ключ жанра → сколько тайтлов набрано именно для него

  for (const [i, g] of map.entries()) {
    const picked = new Set();
    for (const src of g.sources) {
      if (picked.size >= PER_GENRE) break;
      const label = src.genre ? `жанр ${src.genre}` : `тег ${src.tag}`;
      for (let page = 1; page <= MAX_PAGES_PER_SOURCE && picked.size < PER_GENRE; page++) {
        const vars = { page, perPage: PER_PAGE, genre: src.genre ?? null, tag: src.tag ?? null, minTagRank: src.tag ? MIN_TAG_RANK : null };
        const body = await gql(PAGE_QUERY, vars);
        const { media, pageInfo } = body.data.Page;
        let added = 0;
        for (const m of media) {
          if (picked.size >= PER_GENRE) break;
          if (!picked.has(m.id)) { picked.add(m.id); added++; }
          if (!byId.has(m.id)) byId.set(m.id, m);
        }
        log(`[${i + 1}/${map.length}] ${g.name.padEnd(18)} ${label.padEnd(26)} стр. ${page}: +${String(added).padStart(2)} → ${picked.size}/${PER_GENRE}`);
        if (!pageInfo.hasNextPage) break;
      }
    }
    fetchedFor[g.key] = picked.size;
    if (picked.size < PER_GENRE) warn(`«${g.name}»: в API нашлось только ${picked.size} подходящих тайтлов`);
  }

  // Приводим к формату сайта; один тайтл — одна запись, все его разделы в genres
  const anime = [...byId.values()].map(toSiteItem)
    .filter(a => a.genres.length)                     // на всякий случай: без раздела сайта тайтл не нужен
    .sort((a, b) => b.popularity - a.popularity);

  const ids = new Set();
  for (const a of anime) { if (ids.has(a.id)) a.id += '-' + a.anilistId; ids.add(a.id); } // id гарантированно уникальны

  const genres = Object.fromEntries(GENRE_MAP.map(g => [g.key, {
    name: g.name, group: g.group, page: `pages/${g.page}`,
    count: anime.filter(a => a.genres.includes(g.key)).length,
  }]));

  const result = {
    generatedAt: new Date().toISOString(),
    source: { name: 'AniList GraphQL API', url: 'https://anilist.co', note: 'Описания на английском языке, как в AniList' },
    perGenreTarget: PER_GENRE,
    total: anime.length,
    genres,
    anime,
  };

  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  const tmp = OUT_FILE + '.tmp';
  await writeFile(tmp, JSON.stringify(result, null, 2) + '\n', 'utf8');
  await rename(tmp, OUT_FILE);   // атомарно: сайт не увидит наполовину записанный файл

  // ── итог ──
  console.log('\n' + '─'.repeat(64));
  console.log(' Жанр сайта            Набрано для жанра   Всего с этим жанром в JSON');
  console.log('─'.repeat(64));
  for (const g of map) console.log(` ${g.name.padEnd(22)}${String(fetchedFor[g.key]).padStart(10)}${String(genres[g.key].count).padStart(22)}`);
  console.log('─'.repeat(64));
  const noPoster = anime.filter(a => a.poster === PLACEHOLDER).length;
  log(`готово: ${anime.length} уникальных тайтлов → ${path.relative(ROOT, OUT_FILE)}`);
  log(`запросов к API: ${requestsMade}, из кэша: ${cacheHits}, без постера (заглушка): ${noPoster}`);
}

main().catch(err => {
  console.error(ts(), '❌', err.message);
  process.exitCode = 1;
});
