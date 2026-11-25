#!/usr/bin/env node
/**
 * Добавление отдельных тайтлов в каталог: tools/extra-titles.mjs → data/anime.json
 *
 *   node tools/add-titles.mjs           докачать из AniList, перевести описания и встроить в каталог
 *   node tools/add-titles.mjs --dry     только показать, что будет добавлено
 *
 * Формат записи — тот же, что у tools/build-catalog.mjs (жанры сайта по tools/genre-map.mjs,
 * описание обрезается до ~480 символов). Описание переводится на русский тем же способом, что и
 * в tools/translate-catalog.mjs (Google), оригинал сохраняется в synopsisEn.
 * Ответы AniList кладутся в tools/.cache/anilist — после запуска выполните
 *   node tools/build-synonyms.mjs
 * чтобы альтернативные названия новых тайтлов тоже искались на сайте.
 *
 * Тайтлы, которые уже есть в каталоге (по anilistId), не трогаются; тайтлы, не подходящие ни под один
 * жанр сайта, пропускаются (в отчёте видно, какие).
 */
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENRE_MAP, MIN_TAG_RANK } from './genre-map.mjs';
import { TITLE_OVERRIDES } from './title-overrides.mjs';
import { EXTRA_TITLES, EXTRA_GENRES } from './extra-titles.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = path.join(ROOT, 'data', 'anime.json');
const CACHE_DIR = path.join(ROOT, 'tools', '.cache', 'anilist');
const DRY = process.argv.includes('--dry');
const PLACEHOLDER = 'img/poster-placeholder.svg';
const SYNOPSIS_MAX = 480;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── AniList ──
const QUERY = `
query ($ids: [Int], $page: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage }
    media(id_in: $ids, type: ANIME) {
      id idMal siteUrl format seasonYear episodes averageScore popularity
      title { romaji english native }
      synonyms genres
      tags { name rank isMediaSpoiler }
      coverImage { extraLarge large }
      description(asHtml: false)
    }
  }
}`;

async function gql(variables) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: QUERY, variables }),
      signal: AbortSignal.timeout(30000),
    }).catch(err => ({ ok: false, status: 0, err }));
    if (res.status === 429) { await sleep((parseInt(res.headers.get('retry-after') || '60', 10) + 1) * 1000); continue; }
    if (!res.ok) { await sleep(3000 * attempt); continue; }
    const body = await res.json();
    if (body.errors) throw new Error('AniList: ' + body.errors.map(e => e.message).join('; '));
    // в кэш — в том же виде, что у build-catalog.mjs (его читает build-synonyms.mjs)
    const key = createHash('sha1').update(QUERY + JSON.stringify(variables)).digest('hex');
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(path.join(CACHE_DIR, key + '.json'), JSON.stringify(body));
    return body;
  }
  throw new Error('AniList не ответил');
}

// ── приведение к формату сайта (как в build-catalog.mjs) ──
const CYRILLIC = /[А-Яа-яЁё]/;
const NON_RUSSIAN_CYRILLIC = /[Ѐ-ӿ](?<![А-Яа-яЁё])/u;
const UKRAINIAN_HINTS = [
  /[А-Яа-яЁё]['’ʼ][А-Яа-яЁё]/u,
  /ць(?![\p{L}])/iu,
  /(?<![\p{L}])(та|що|це|від|який|яка|яке|які|його|вона|вони|між|після|через|навіть|також|ще|мене|тебе)(?![\p{L}])/iu,
];
const isRussianTitle = s => CYRILLIC.test(s) && !NON_RUSSIAN_CYRILLIC.test(s) && !UKRAINIAN_HINTS.some(rx => rx.test(s));

function pickRussianTitle(media) {
  return EXTRA_TITLES[media.id] || TITLE_OVERRIDES[media.id] || (media.synonyms || []).find(isRussianTitle) || null;
}

function slugify(s) {
  return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '') || 'anime';
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
       .replace(/~!.*?!~/gs, '').replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (s.length <= SYNOPSIS_MAX) return s;
  const cut = s.slice(0, SYNOPSIS_MAX);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return (end > SYNOPSIS_MAX * 0.5 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…').trim();
}

function siteGenresFor(media) {
  const genres = new Set(media.genres || []);
  const tags = new Set((media.tags || []).filter(t => t.rank >= MIN_TAG_RANK && !t.isMediaSpoiler).map(t => t.name));
  return GENRE_MAP.filter(g => g.sources.some(s => (s.genre && genres.has(s.genre)) || (s.tag && tags.has(s.tag)))).map(g => g.key);
}

function toSiteItem(media) {
  return {
    id: `${slugify(media.title.english || media.title.romaji)}-${media.id}`,
    title: pickRussianTitle(media) || media.title.english || media.title.romaji || media.title.native,
    titleOriginal: media.title.romaji || null,
    titleEnglish: media.title.english || null,
    genres: siteGenresFor(media).length ? siteGenresFor(media) : (EXTRA_GENRES[media.id] || []),
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

// ── перевод описания на русский (как translate-catalog.mjs, Google без ключа) ──
async function translate(text) {
  if (!text) return '';
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ru&dt=t', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({ q: text }),
        signal: AbortSignal.timeout(45000),
      });
      if (res.ok) {
        const data = await res.json();
        const ru = (data?.[0] || []).map(seg => seg?.[0] || '').join('');
        return ru.replace(/\s+([,.!?;:])/g, '$1').replace(/\s{2,}/g, ' ').replace(/« /g, '«').replace(/ »/g, '»').trim();
      }
    } catch { /* повтор */ }
    await sleep(2000 * attempt);
  }
  return null; // не удалось — останется английское описание
}

async function main() {
  const catalog = JSON.parse(await readFile(CATALOG, 'utf8'));
  const have = new Set(catalog.anime.map(a => a.anilistId));
  const wanted = Object.keys(EXTRA_TITLES).map(Number).filter(id => !have.has(id));
  console.log(`в списке ${Object.keys(EXTRA_TITLES).length}, новых для каталога: ${wanted.length}`);
  if (!wanted.length) return;

  const media = [];
  for (let page = 1; page <= 5; page++) {
    const body = await gql({ ids: wanted, page });
    media.push(...body.data.Page.media);
    if (!body.data.Page.pageInfo.hasNextPage) break;
    await sleep(2200);
  }

  const items = media.map(toSiteItem);
  const skipped = items.filter(a => !a.genres.length);
  const added = items.filter(a => a.genres.length);
  const notFound = wanted.filter(id => !media.some(m => m.id === id));
  if (notFound.length) console.log('не найдены в AniList:', notFound.join(', '));
  if (skipped.length) console.log('пропущены (нет подходящего жанра сайта):', skipped.map(a => `${a.title} (${a.anilistId})`).join('; '));

  if (DRY) { added.forEach(a => console.log(`+ ${a.title} | ${a.titleEnglish || a.titleOriginal} | ${a.genres.join(',')}`)); return; }

  let translated = 0;
  for (const a of added) {
    a.synopsisEn = a.synopsis;
    const ru = await translate(a.synopsisEn);
    if (ru && CYRILLIC.test(ru)) { a.synopsis = ru; translated++; }
    await sleep(900);
  }

  // встраиваем по популярности (каталог отсортирован по убыванию popularity), id — уникальные
  const ids = new Set(catalog.anime.map(a => a.id));
  for (const a of added) { if (ids.has(a.id)) a.id += '-' + a.anilistId; ids.add(a.id); }
  catalog.anime = catalog.anime.concat(added).sort((x, y) => (y.popularity || 0) - (x.popularity || 0));
  catalog.total = catalog.anime.length;
  for (const key of Object.keys(catalog.genres)) {
    catalog.genres[key].count = catalog.anime.filter(a => a.genres.includes(key)).length;
  }
  catalog.updatedAt = new Date().toISOString();

  const tmp = CATALOG + '.tmp';
  await writeFile(tmp, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
  await rename(tmp, CATALOG);
  console.log(`добавлено ${added.length}, описаний переведено ${translated}; всего в каталоге ${catalog.total}`);
  added.forEach(a => console.log(`+ ${a.title} | ${a.titleEnglish || a.titleOriginal} | ${a.genres.join(',')}`));
}

main().catch(err => { console.error('❌', err.message); process.exitCode = 1; });
