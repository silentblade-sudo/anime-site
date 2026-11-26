#!/usr/bin/env node
/**
 * Проверка JSON-данных сайта перед публикацией на Firebase Hosting.
 *
 *   node tools/validate-data.mjs            — проверить data/*.json
 *   node tools/validate-data.mjs --strict   — считать предупреждения ошибками
 *
 * Запускается автоматически перед `firebase deploy --only hosting` (firebase.json → hosting.predeploy):
 * при ошибке деплой отменяется, и битый файл не попадёт на сайт.
 *
 * Что проверяется:
 *   • все data/*.json — валидный JSON;
 *   • data/anime.json — каталог: массив anime, уникальные id, названия;
 *   • data/anime-synonyms.json — синонимы только для тайтлов из каталога;
 *   • data/schedule.json — расписание (tools/build-schedule.mjs): поля, даты, номера серий,
 *     ссылки catalogId на каталог, свежесть файла (лента уведомлений js/player-notify.js и pages/news.html);
 *   • data/site-events.json — события сайта для ленты уведомлений: уникальные id «site:…», даты, страницы.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const STRICT = process.argv.includes('--strict');
const errors = [], warnings = [];
const err = (f, m) => errors.push(`${f}: ${m}`);
const warn = (f, m) => warnings.push(`${f}: ${m}`);
const NOW = Date.now() / 1000;
const isInt = (v) => Number.isInteger(v);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const validIso = (v) => isStr(v) && !Number.isNaN(Date.parse(v));

async function readJson(file) {
  const full = path.join(DATA, file);
  try {
    return JSON.parse(await readFile(full, 'utf8'));
  } catch (e) {
    err(file, e.code === 'ENOENT' ? 'файл не найден' : 'невалидный JSON — ' + e.message);
    return null;
  }
}

async function pageExists(page) {
  const clean = decodeURI(String(page).split(/[?#]/)[0]);
  if (!clean || /^https?:/i.test(page)) return true;
  try { return (await stat(path.join(ROOT, clean))).isFile(); } catch { return false; }
}

// ───────── каталог ─────────
function checkCatalog(cat) {
  const f = 'anime.json';
  const ids = new Set();
  if (!cat || !Array.isArray(cat.anime)) { err(f, 'нет массива anime'); return ids; }
  cat.anime.forEach((a, i) => {
    if (!a || !isStr(a.id)) { err(f, `anime[${i}]: нет id`); return; }
    if (ids.has(a.id)) err(f, `повторяется id «${a.id}»`);
    ids.add(a.id);
    if (!isStr(a.title)) err(f, `«${a.id}»: пустое название`);
  });
  return ids;
}

function checkSynonyms(syn, ids) {
  const f = 'anime-synonyms.json';
  if (!syn || typeof syn !== 'object') { err(f, 'ожидается объект { id: [синонимы] }'); return; }
  const extra = Object.keys(syn).filter((k) => !ids.has(k) && !k.startsWith('_'));
  if (extra.length) warn(f, `синонимы для ${extra.length} тайтлов, которых нет в каталоге (например «${extra[0]}»)`);
}

// ───────── расписание ─────────
function checkSchedule(s, ids) {
  const f = 'schedule.json';
  if (!s) return;
  if (!validIso(s.generatedAt)) err(f, 'generatedAt — не дата ISO');
  else {
    const ageDays = (Date.now() - Date.parse(s.generatedAt)) / 86400000;
    if (ageDays > 7) warn(f, `файлу ${Math.floor(ageDays)} дн. — обновите: node tools/build-schedule.mjs`);
    if (ageDays < -1) err(f, 'generatedAt в будущем');
  }
  for (const sec of ['ongoing', 'premieres', 'sequels']) {
    if (!Array.isArray(s[sec])) { err(f, `нет массива ${sec}`); continue; }
    if (!s[sec].length) warn(f, `${sec}: пусто`);
    const seen = new Set();
    s[sec].forEach((it, i) => {
      const at = `${sec}[${i}]`;
      if (!it || !isInt(it.anilistId)) { err(f, `${at}: нет anilistId`); return; }
      const name = `${sec} «${it.title || it.anilistId}»`;
      if (seen.has(it.anilistId)) err(f, `${name}: повтор anilistId ${it.anilistId}`);
      seen.add(it.anilistId);
      if (!isStr(it.title)) err(f, `${at}: пустое название`);
      if (it.catalogId != null && !ids.has(it.catalogId)) err(f, `${name}: catalogId «${it.catalogId}» нет в data/anime.json`);
      if (it.startDate != null) {
        const d = it.startDate;
        if (!isInt(d.year) || (d.month != null && !(d.month >= 1 && d.month <= 12)) || (d.day != null && !(d.day >= 1 && d.day <= 31)))
          err(f, `${name}: некорректная startDate ${JSON.stringify(d)}`);
      }
      if (it.episodes != null && !(isInt(it.episodes) && it.episodes > 0)) err(f, `${name}: episodes должно быть > 0`);
      if (sec === 'ongoing') {
        if (!isInt(it.nextEpisode) || it.nextEpisode < 1) err(f, `${name}: nextEpisode должно быть ≥ 1`);
        if (!isInt(it.airingAt)) err(f, `${name}: airingAt — время в секундах (Unix)`);
        else if (it.airingAt > 1e11) err(f, `${name}: airingAt похоже в миллисекундах, нужны секунды`);
        else if (it.airingAt < NOW - 14 * 86400) warn(f, `${name}: серия ${it.nextEpisode} должна была выйти больше 2 недель назад`);
        if (it.episodes && it.nextEpisode > it.episodes) err(f, `${name}: серия ${it.nextEpisode} больше, чем всего серий (${it.episodes})`);
      } else if (it.airingAt != null && !isInt(it.airingAt)) err(f, `${name}: airingAt — время в секундах (Unix)`);
      if (sec === 'sequels' && it.prequel && it.prequel.catalogId && !ids.has(it.prequel.catalogId))
        err(f, `${name}: prequel.catalogId «${it.prequel.catalogId}» нет в каталоге`);
    });
  }
}

// ───────── события сайта ─────────
async function checkSiteEvents(se) {
  const f = 'site-events.json';
  if (!se) return;
  if (!Array.isArray(se.events)) { err(f, 'нет массива events'); return; }
  const seen = new Set();
  for (const [i, e] of se.events.entries()) {
    const at = `events[${i}]`;
    if (!e || !isStr(e.id) || !/^site:[a-z0-9_-]{1,60}$/.test(e.id)) { err(f, `${at}: id должен быть вида «site:имя» (латиница, цифры, - и _)`); continue; }
    if (seen.has(e.id)) err(f, `повторяется id «${e.id}» — у нового события должен быть новый id`);
    seen.add(e.id);
    if (!isStr(e.title) || e.title.length > 120) err(f, `«${e.id}»: title обязателен, до 120 символов`);
    if (e.text != null && (typeof e.text !== 'string' || e.text.length > 240)) err(f, `«${e.id}»: text — строка до 240 символов`);
    if (!validIso(e.at)) err(f, `«${e.id}»: at — дата ISO 8601, например 2026-11-27T12:00:00Z`);
    else if (Date.parse(e.at) > Date.now()) warn(f, `«${e.id}»: дата в будущем — появится в ленте ${e.at}`);
    if (e.page != null && !(await pageExists(e.page))) err(f, `«${e.id}»: страница «${e.page}» не найдена`);
    if (e.icon != null && (typeof e.icon !== 'string' || [...e.icon].length > 4)) warn(f, `«${e.id}»: icon — один эмодзи`);
  }
}

async function main() {
  const files = (await readdir(DATA)).filter((n) => n.endsWith('.json'));
  const parsed = {};
  for (const n of files) parsed[n] = await readJson(n);
  const ids = checkCatalog(parsed['anime.json']);
  checkSynonyms(parsed['anime-synonyms.json'], ids);
  checkSchedule(parsed['schedule.json'], ids);
  await checkSiteEvents(parsed['site-events.json']);
  if (!parsed['schedule.json']) err('schedule.json', 'нужен для «Графика выхода» и ленты уведомлений');

  const s = parsed['schedule.json'];
  console.log(`• data/: ${files.join(', ')}`);
  if (s && Array.isArray(s.ongoing)) console.log(`• расписание от ${s.generatedAt}: онгоингов ${s.ongoing.length}, премьер ${(s.premieres || []).length}, продолжений ${(s.sequels || []).length}`);
  if (parsed['site-events.json']) console.log(`• событий сайта: ${(parsed['site-events.json'].events || []).length}`);
  warnings.forEach((w) => console.log('⚠️ ', w));
  errors.forEach((e) => console.error('❌', e));
  const fail = errors.length || (STRICT && warnings.length);
  console.log(fail ? `✖ данные не прошли проверку (ошибок: ${errors.length}, предупреждений: ${warnings.length})` : `✔ данные в порядке${warnings.length ? ` (предупреждений: ${warnings.length})` : ''}`);
  process.exitCode = fail ? 1 : 0;
}

main().catch((e) => { console.error('❌', e.message); process.exitCode = 1; });
