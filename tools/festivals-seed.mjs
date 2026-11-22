#!/usr/bin/env node
/* Наполнение коллекции Firestore `festivals` для pages/news.html — без ручных опечаток.
 *
 *   node tools/festivals-seed.mjs check   [--file my.json]          проверить данные по схеме (сеть не нужна)
 *   node tools/festivals-seed.mjs template [--id my-fest] [--out f]  пример события со ВСЕМИ полями
 *   node tools/festivals-seed.mjs export  [--out файл.json]          справочник js/festivals-data.js → tools/festivals.json
 *   node tools/festivals-seed.mjs pull    [--out файл.json]          коллекция из Firestore → tools/festivals-live.json
 *   node tools/festivals-seed.mjs push --key <ключ.json> [--file my.json] [--only id1,id2] [--merge] [--yes]
 *                                                                    загрузить в Firestore (без --yes — только план)
 *
 * Источник данных по умолчанию — js/festivals-data.js; --file принимает JSON: массив событий или { "id": {…} }.
 *
 * Запись. Правила Firestore запрещают запись с сайта (allow write: if false) — и это правильно. Поэтому push
 * работает через Firebase Admin SDK с ключом сервисного аккаунта:
 *   1) Firebase Console → ⚙ Project settings → Service accounts → Generate new private key;
 *   2) сохраните файл ВНЕ папки сайта (скрипт откажется работать с ключом внутри проекта —
 *      иначе он может попасть в Git или на хостинг);
 *   3) один раз установите библиотеку:  npm install --prefix tools firebase-admin
 *   4) node tools/festivals-seed.mjs push --key "C:\keys\anime-world-admin.json" --yes
 * С эмулятором Firestore: задайте FIRESTORE_EMULATOR_HOST=localhost:8080 — ключ тогда не нужен.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_ID = 'anime-world-3a951';
const COLLECTION = 'festivals';

// ───────────────────────── аргументы ─────────────────────────
const [, , cmd = 'help', ...rest] = process.argv;
const opt = {};
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (!a.startsWith('--')) continue;
  const key = a.slice(2);
  const next = rest[i + 1];
  if (next !== undefined && !next.startsWith('--')) { opt[key] = next; i++; } else opt[key] = true;
}

// ───────────────────────── схема ─────────────────────────
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})?$/;
const TZ = /^[+-]\d{2}:\d{2}$/;
const ID = /^[a-z0-9][a-z0-9-]{1,60}$/;
const IMG = /^(https:\/\/|\.\.\/img\/|img\/|\/img\/)/i;
const LINK = /^((news|content|movies|favorites)\.html(\?[\w=&%-]*)?|\.\.\/index\.html|https:\/\/.+)$/;
const SESSION_STATUS = ['', 'перенесён', 'перенесен', 'отменён', 'отменен'];

// Поля события и элементов списков: тип и обязательность
const EVENT_FIELDS = {
  id: 'string', title: 'string!', kind: 'string', city: 'string', venue: 'string',
  start: 'date!', end: 'date', tz: 'tz', tzLabel: 'string', tagline: 'string',
  intro: 'string[]', zones: 'zone[]', timeline: 'timeline[]', gallery: 'photo[]',
  rules: 'rules', prizes: 'prize[]', wins: 'win[]', sessions: 'session[]', upcoming: 'upcoming[]',
  hidden: 'boolean'
};
const ITEM_FIELDS = {
  zone: { icon: 'string', title: 'string!', text: 'string' },
  timeline: { at: 'datetime!', title: 'string!', text: 'string' },
  photo: { src: 'img', caption: 'string', tag: 'string' },
  rules: { howItWorks: 'string', steps: 'string[]' },
  prize: { title: 'string!', desc: 'string', qty: 'string' },
  win: { at: 'datetime', who: 'string!', prize: 'string!', how: 'string' },
  session: { start: 'datetime!', end: 'datetime', title: 'string!', place: 'string', desc: 'string', status: 'status' },
  upcoming: { date: 'date!', title: 'string!', desc: 'string', link: 'link' }
};
// Частые ошибки в именах полей → правильное имя
const RENAMES = {
  event: { upcomingReleases: 'upcoming', whatHappened: 'intro', subtitle: 'tagline', startDate: 'start', endDate: 'end',
    name: 'title', description: 'tagline', photos: 'gallery', images: 'gallery', schedule: 'sessions', winners: 'wins',
    prizesAndRules: 'prizes / wins / rules (отдельными полями)', timezone: 'tz', place: 'venue', location: 'venue' },
  photo: { url: 'src', image: 'src', img: 'src', photo: 'src', link: 'src', title: 'caption', text: 'caption', description: 'caption', tags: 'tag', category: 'tag' },
  prize: { name: 'title', description: 'desc', text: 'desc', count: 'qty', quantity: 'qty', amount: 'qty' },
  win: { name: 'who', winner: 'who', user: 'who', time: 'at', date: 'at', reward: 'prize', item: 'prize', description: 'how', desc: 'how' },
  session: { date: 'start', time: 'start (дата и время вместе: 2026-11-07T14:30)', name: 'title', description: 'desc', location: 'place', venue: 'place', finish: 'end' },
  upcoming: { name: 'title', description: 'desc', url: 'link', href: 'link', start: 'date' },
  zone: { name: 'title', description: 'text', desc: 'text', emoji: 'icon' },
  timeline: { time: 'at', date: 'at', name: 'title', description: 'text', desc: 'text' },
  rules: { text: 'howItWorks', description: 'howItWorks', list: 'steps' }
};

function checkValue(type, value, path, problems, partial) {
  const required = type.endsWith('!') && !partial;
  const t = type.replace('!', '');
  if (value === undefined || value === null || value === '') {
    if (required) problems.push({ level: 'error', path, msg: 'обязательное поле не заполнено' });
    return;
  }
  const fail = (msg) => problems.push({ level: 'error', path, msg });
  if (t.endsWith('[]')) {
    if (!Array.isArray(value)) return fail('должен быть массив (array в консоли Firestore)');
    const inner = t.slice(0, -2);
    value.forEach((v, i) => {
      if (inner === 'string') { if (typeof v !== 'string') fail(`[${i}] должен быть строкой`); }
      else checkObject(inner, v, `${path}[${i}]`, problems);
    });
    return;
  }
  if (ITEM_FIELDS[t]) return checkObject(t, value, path, problems);
  switch (t) {
    case 'string': if (typeof value !== 'string') fail('должна быть строка'); break;
    case 'boolean': if (typeof value !== 'boolean') fail('должно быть true или false (boolean)'); break;
    case 'date': if (typeof value !== 'string' || !DATE.test(value)) fail(`дата строкой «ГГГГ-ММ-ДД», сейчас: ${JSON.stringify(value)}`); break;
    case 'datetime': if (typeof value !== 'string' || !DATETIME.test(value)) fail(`дата и время строкой «ГГГГ-ММ-ДДTЧЧ:ММ», сейчас: ${JSON.stringify(value)}`); break;
    case 'tz': if (typeof value !== 'string' || !TZ.test(value)) fail(`смещение пояса вида «+03:00», сейчас: ${JSON.stringify(value)}`); break;
    case 'img': if (typeof value !== 'string' || !IMG.test(value)) fail(`адрес фото: "../img/…", "img/…" или "https://…" (пустая строка — заглушка), сейчас: ${JSON.stringify(value)}`); break;
    case 'link': if (typeof value !== 'string' || !LINK.test(value)) fail(`ссылка: "news.html?id=…", "content.html?id=…" или "https://…", сейчас: ${JSON.stringify(value)}`); break;
    case 'status': if (!SESSION_STATUS.includes(String(value).toLowerCase())) fail('статус: пусто, "перенесён" или "отменён" (скоро/идёт/завершён считаются сами)'); break;
    default: break;
  }
}

function checkObject(kind, obj, path, problems, partial) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    problems.push({ level: 'error', path, msg: 'должен быть объект (map в консоли Firestore)' });
    return;
  }
  const fields = kind === 'event' ? EVENT_FIELDS : ITEM_FIELDS[kind];
  Object.keys(obj).forEach((k) => {
    if (fields[k]) return;
    const hint = (RENAMES[kind] || {})[k];
    problems.push({ level: hint ? 'error' : 'warn', path: `${path}.${k}`,
      msg: hint ? `неизвестное поле — правильно: «${hint}»` : 'неизвестное поле — страница его не покажет' });
  });
  // partial: документ дополняет событие из справочника — поля самого события не обязательны
  Object.entries(fields).forEach(([k, type]) => checkValue(type, obj[k], `${path}.${k}`, problems, partial && kind === 'event'));
}

function checkEvent(ev, key, partial) {
  const problems = [];
  const id = ev && (ev.id || key);
  const path = id || '(без id)';
  if (!id) problems.push({ level: 'error', path, msg: 'нет id события' });
  else if (!ID.test(id)) problems.push({ level: 'error', path: `${path}.id`, msg: 'id: латиница, цифры и дефис (это имя документа и ?id= в адресе)' });
  checkObject('event', ev, path, problems, partial);
  if (ev && DATE.test(ev.start || '') && DATE.test(ev.end || '') && ev.end < ev.start) {
    problems.push({ level: 'error', path: `${path}.end`, msg: 'end раньше start' });
  }
  (ev && Array.isArray(ev.sessions) ? ev.sessions : []).forEach((s, i) => {
    if (s && DATETIME.test(s.start || '') && DATETIME.test(s.end || '') && s.end < s.start) {
      problems.push({ level: 'error', path: `${path}.sessions[${i}].end`, msg: 'конец сеанса раньше начала' });
    }
  });
  return problems;
}

// ───────────────────────── источники данных ─────────────────────────
function loadLocal() {
  const code = readFileSync(join(ROOT, 'js', 'festivals-data.js'), 'utf8');
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx.window.FESTIVALS || [];
}
function loadFile(file) {
  const data = JSON.parse(readFileSync(resolve(file), 'utf8'));
  if (Array.isArray(data)) return data;
  return Object.entries(data).map(([id, ev]) => ({ id, ...ev }));
}
function loadEvents() { return opt.file ? loadFile(opt.file) : loadLocal(); }

// Документ Firestore = событие без поля id (id — это имя документа)
function toDoc(ev) {
  const { id, ...rest } = ev;
  return JSON.parse(JSON.stringify(rest)); // убираем undefined и функции
}

function report(events) {
  let errors = 0, warns = 0;
  // id из справочника js/festivals-data.js: такой документ только дополняет событие, start/title берутся оттуда
  const localIds = new Set(loadLocal().map((e) => e.id));
  const seen = new Set();
  events.forEach((ev, i) => {
    const partial = !!(ev && localIds.has(ev.id));
    const problems = checkEvent(ev, ev && ev.id, partial);
    if (ev && ev.id) {
      if (seen.has(ev.id)) problems.push({ level: 'error', path: ev.id, msg: 'повторяется id — второе событие перезапишет первое' });
      seen.add(ev.id);
    }
    const label = (ev && ev.id) || `#${i + 1}`;
    const note = partial ? '  (дополняет справочник)' : '';
    if (!problems.length) { console.log(`✓ ${label}${note}`); return; }
    console.log(`✗ ${label}${note}`);
    problems.forEach((p) => {
      if (p.level === 'error') errors++; else warns++;
      console.log(`   ${p.level === 'error' ? 'ОШИБКА' : 'внимание'}  ${p.path}: ${p.msg}`);
    });
  });
  console.log(`\nСобытий: ${events.length}. Ошибок: ${errors}. Предупреждений: ${warns}.`);
  return errors;
}

// ───────────────────────── Firestore: чтение (REST, без ключа) ─────────────────────────
function fromFirestoreValue(v) {
  const [type, x] = Object.entries(v)[0];
  if (type === 'mapValue') return Object.fromEntries(Object.entries(x.fields || {}).map(([k, vv]) => [k, fromFirestoreValue(vv)]));
  if (type === 'arrayValue') return (x.values || []).map(fromFirestoreValue);
  if (type === 'integerValue') return Number(x);
  if (type === 'nullValue') return null;
  return x; // stringValue, booleanValue, doubleValue, timestampValue (строка ISO)
}
async function pullLive() {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION}?pageSize=300`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.error) throw new Error(`${json.error.status}: ${json.error.message}`);
  return (json.documents || []).map((d) => ({ id: d.name.split('/').pop(), ...fromFirestoreValue({ mapValue: { fields: d.fields || {} } }) }));
}

// ───────────────────────── Firestore: запись (Admin SDK) ─────────────────────────
// Модульный API (firebase-admin/app и firebase-admin/firestore): есть и в старых версиях (10+),
// и в новых. Старый «namespace»-API (admin.apps, admin.credential, admin.firestore()) убран в версии 14 —
// из-за него push падал с «Cannot read properties of undefined (reading 'length')».
async function getAdmin() {
  const require = createRequire(join(ROOT, 'tools', 'package.json'));
  try {
    const app = require('firebase-admin/app');
    const firestore = require('firebase-admin/firestore');
    return { initializeApp: app.initializeApp, cert: app.cert, getApps: app.getApps, getFirestore: firestore.getFirestore };
  } catch (e) {
    console.error('Нет библиотеки firebase-admin. Установите один раз:\n  npm install --prefix tools firebase-admin');
    process.exit(1);
  }
}
function checkKeyPath(keyPath) {
  const abs = resolve(keyPath);
  const rel = relative(ROOT, abs);
  if (!rel.startsWith('..') && !isAbsolute(rel)) {
    console.error('Ключ сервисного аккаунта лежит внутри папки сайта — так он может попасть в Git или на хостинг.\n' +
      'Перенесите его, например, в C:\\keys\\ и запустите снова.');
    process.exit(1);
  }
  if (!existsSync(abs)) { console.error(`Файл ключа не найден: ${abs}`); process.exit(1); }
  return abs;
}

async function push() {
  let events = loadEvents();
  if (opt.only) {
    const only = String(opt.only).split(',').map((s) => s.trim());
    events = events.filter((e) => only.includes(e.id));
    if (!events.length) { console.error(`Нет событий с id: ${only.join(', ')}`); process.exit(1); }
  }
  console.log('Проверяю данные перед загрузкой…\n');
  if (report(events)) { console.error('\nЕсть ошибки — ничего не загружено. Исправьте и запустите снова.'); process.exit(1); }

  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  console.log(`\nКуда: ${emulator ? `эмулятор ${emulator}` : `проект ${PROJECT_ID}`}, коллекция «${COLLECTION}»`);
  console.log(`Режим: ${opt.merge ? 'merge — заменяются только указанные поля, остальные в документе остаются'
    : 'полная замена документа (поля, которых нет в данных, удаляются из документа)'}`);
  events.forEach((e) => console.log(`  → ${COLLECTION}/${e.id}  (${e.title})`));
  if (!opt.yes) { console.log('\nЭто план. Чтобы записать, добавьте --yes'); return; }

  const admin = await getAdmin();
  if (!admin.getApps().length) {
    if (emulator) admin.initializeApp({ projectId: PROJECT_ID });
    else {
      const keyPath = opt.key || process.env.GOOGLE_APPLICATION_CREDENTIALS;
      if (!keyPath) { console.error('Укажите ключ: --key "C:\\keys\\anime-world-admin.json"'); process.exit(1); }
      const key = JSON.parse(readFileSync(checkKeyPath(keyPath), 'utf8'));
      if (key.project_id && key.project_id !== PROJECT_ID) {
        console.error(`Ключ от другого проекта (${key.project_id}), ожидается ${PROJECT_ID}.`); process.exit(1);
      }
      admin.initializeApp({ credential: admin.cert(key), projectId: PROJECT_ID });
    }
  }
  const db = admin.getFirestore();
  const batch = db.batch();
  events.forEach((e) => batch.set(db.collection(COLLECTION).doc(e.id), toDoc(e), { merge: !!opt.merge }));
  await batch.commit();
  console.log(`\nГотово: записано документов — ${events.length}. Страница pages/news.html обновится сама.`);
}

// ───────────────────────── шаблон ─────────────────────────
function template(id) {
  return {
    id,
    title: 'Название события',
    kind: 'Фестиваль',
    city: 'Москва',
    venue: 'Площадка',
    start: '2027-03-20',
    end: '2027-03-21',
    tz: '+03:00',
    tzLabel: 'по Москве',
    tagline: 'Одна живая фраза под заголовком.',
    intro: ['Первый абзац рассказа.', 'Второй абзац.'],
    zones: [{ icon: '🎤', title: 'Главная сцена', text: 'Что там происходит.' }],
    timeline: [{ at: '2027-03-20T10:00', title: 'Открытие', text: 'Что было.' }],
    gallery: [
      { src: '../img/festivals/имя-файла.jpg', caption: 'Подпись к кадру', tag: 'Сцена' },
      { src: '', caption: 'Кадр ещё не загружен — будет заглушка', tag: 'Косплей' }
    ],
    rules: { howItWorks: 'Как участвовать и как выбирают победителей.', steps: ['Шаг 1', 'Шаг 2'] },
    prizes: [{ title: 'Главный приз', desc: 'Описание приза', qty: '1 шт.' }],
    wins: [{ at: '2027-03-21T16:05', who: 'Гость с билетом № 0427', prize: 'Главный приз', how: 'Розыгрыш на сцене' }],
    sessions: [{ start: '2027-03-20T12:00', end: '2027-03-20T13:00', title: 'Панель', place: 'Главная сцена', desc: 'О чём', status: '' }],
    upcoming: [{ date: '2027-04-01', title: 'Что выходит дальше', desc: 'Описание', link: 'news.html?id=tokyo-festival' }]
  };
}

// ───────────────────────── команды ─────────────────────────
async function main() {
  switch (cmd) {
    case 'check': {
      const errors = report(loadEvents());
      process.exit(errors ? 1 : 0);
      break;
    }
    case 'template': {
      const json = JSON.stringify([template(opt.id || 'new-festival')], null, 2);
      if (opt.out) { writeFileSync(resolve(opt.out), json); console.log(`Шаблон записан: ${resolve(opt.out)}`); }
      else console.log(json);
      break;
    }
    case 'export': {
      const out = resolve(opt.out || join(ROOT, 'tools', 'festivals.json'));
      writeFileSync(out, JSON.stringify(loadLocal(), null, 2));
      console.log(`Справочник выгружен: ${out}\nПравьте и проверяйте: node tools/festivals-seed.mjs check --file "${out}"`);
      break;
    }
    case 'pull': {
      const live = await pullLive();
      const out = resolve(opt.out || join(ROOT, 'tools', 'festivals-live.json'));
      writeFileSync(out, JSON.stringify(live, null, 2));
      console.log(`Из Firestore: документов — ${live.length}, сохранено в ${out}\n`);
      report(live);
      break;
    }
    case 'push': await push(); break;
    default:
      console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*|^ \*/gm, ''));
  }
}

main().catch((e) => { console.error('Ошибка:', e.message); process.exit(1); });
