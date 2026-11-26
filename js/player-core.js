/* Профиль Игрока — общие механики «Системы»: уровни, ранги, награды, квесты, хранение.
 * Используют pages/profile.html (терминал) и js/player-chip.js (мини-карточка в шапке).
 * Firebase — общий, через js/chat-core.js (AnimeChat.services()).
 *
 * Документ users/{uid} (пишется ТОЛЬКО с { merge: true } — поля AnimeVerse, например anime, не трогаются):
 *   username        — никнейм (его же показывают чат и шапка)
 *   exp, level      — опыт и уровень
 *   selectedTitle   — выбранное звание, selectedFrame — выбранная рамка аватара
 *   claimedQuests   — { id квеста: дата получения награды }
 *   unlockedRewards — открытые награды (звания, рамки, артефакты)
 *   watched         — отмеченные просмотренные тайтлы [{ id, title }], watchedCount — их число
 *   lastDailyClaim  — дата последней ежедневной тренировки (ГГГГ-ММ-ДД), dailyStreak, dailyTotal
 */
(function () {
  'use strict';
  if (window.AnimePlayer) return;

  // ───────── уровни и ранги ─────────
  // Опыт до следующего уровня: 100 на 1-м, затем +50 за каждый уровень (100, 150, 200, …)
  function expToNext(level) { return 100 + (level - 1) * 50; }

  function levelInfo(exp) {
    exp = Math.max(0, Math.floor(exp || 0));
    var level = 1, rest = exp;
    while (rest >= expToNext(level) && level < 99) { rest -= expToNext(level); level++; }
    return { level: level, into: rest, need: expToNext(level), total: exp };
  }

  var RANKS = [
    { min: 40, id: 'monarch', name: 'Монарх Теней', short: 'Монарх' },
    { min: 30, id: 's', name: 'S-ранг', short: 'S' },
    { min: 20, id: 'a', name: 'A-ранг', short: 'A' },
    { min: 15, id: 'b', name: 'B-ранг', short: 'B' },
    { min: 10, id: 'c', name: 'C-ранг', short: 'C' },
    { min: 5, id: 'd', name: 'D-ранг', short: 'D' },
    { min: 1, id: 'e', name: 'E-ранг', short: 'E' }
  ];
  function rankFor(level) {
    for (var i = 0; i < RANKS.length; i++) if (level >= RANKS[i].min) return RANKS[i];
    return RANKS[RANKS.length - 1];
  }

  // ───────── награды ─────────
  // type: frame | title | artifact; rarity: common | rare | epic | legendary
  var REWARDS = {
    // рамки аватара (CSS-классы pf-frame-*)
    frame_common: { type: 'frame', name: 'Обычная рамка', rarity: 'common', icon: '⬜', desc: 'Стандартная рамка пробуждённого игрока.' },
    frame_crimson: { type: 'frame', name: 'Алая рамка', rarity: 'rare', icon: '🟥', desc: 'Рамка, закалённая в пятнадцати вратах.' },
    frame_epic: { type: 'frame', name: 'Пульс маны', rarity: 'epic', icon: '💠', desc: 'Эпическая рамка с пульсирующим свечением.' },
    frame_shadow: { type: 'frame', name: 'Теневая рамка', rarity: 'legendary', icon: '🌑', desc: 'Легендарная рамка из живой тьмы.' },
    frame_flame: { type: 'frame', name: 'Огненная рамка', rarity: 'legendary', icon: '🔥', desc: 'Легендарная рамка багрового пламени.' },
    // звания (показываются под ником)
    title_rank_e: { type: 'title', name: 'Охотник E-ранга', rarity: 'common', icon: '🎖️', desc: 'Каждый путь начинается с самого низа.' },
    title_rank_d: { type: 'title', name: 'Охотник D-ранга', rarity: 'common', icon: '🎖️', desc: 'Первые шаги остались позади.' },
    title_rank_c: { type: 'title', name: 'Охотник C-ранга', rarity: 'rare', icon: '🎖️', desc: 'Опытный боец гильдии.' },
    title_rank_b: { type: 'title', name: 'Охотник B-ранга', rarity: 'rare', icon: '🎖️', desc: 'Сила, с которой считаются.' },
    title_rank_a: { type: 'title', name: 'Охотник A-ранга', rarity: 'epic', icon: '🏅', desc: 'Элита среди охотников.' },
    title_rank_s: { type: 'title', name: 'Охотник S-ранга', rarity: 'epic', icon: '🏅', desc: 'Сильнейшие из сильнейших.' },
    title_monarch: { type: 'title', name: 'Монарх Теней', rarity: 'legendary', icon: '👑', desc: 'Вершина Системы.' },
    title_awakened: { type: 'title', name: 'Пробуждённый', rarity: 'common', icon: '✨', desc: 'Система признала нового игрока.' },
    title_gate_conqueror: { type: 'title', name: 'Покоритель врат', rarity: 'epic', icon: '🌀', desc: 'Тридцать миров покорены.' },
    title_guild_voice: { type: 'title', name: 'Голос гильдии', rarity: 'rare', icon: '📣', desc: 'Слово, услышанное гильдией.' },
    title_chronicler: { type: 'title', name: 'Летописец', rarity: 'rare', icon: '📖', desc: 'Хранитель историй десяти миров.' },
    title_tireless: { type: 'title', name: 'Неутомимый', rarity: 'epic', icon: '⚡', desc: 'Семь дней тренировок без устали.' },
    // артефакты и подарки
    artifact_mana_crystal: { type: 'artifact', name: 'Кристалл маны', rarity: 'common', icon: '💎', desc: 'Первый дар Системы пробуждённому.' },
    artifact_gate_key: { type: 'artifact', name: 'Ключ от врат', rarity: 'common', icon: '🗝️', desc: 'Открывает дорогу в новые миры.' },
    artifact_scroll: { type: 'artifact', name: 'Свиток охотника', rarity: 'common', icon: '📜', desc: 'В него записан первый пройденный мир.' },
    artifact_dungeon_map: { type: 'artifact', name: 'Карта подземелий', rarity: 'common', icon: '🗺️', desc: 'Каталог и график выхода — изучены.' },
    artifact_rune: { type: 'artifact', name: 'Руна знаний', rarity: 'rare', icon: '🔮', desc: 'Знание пяти жанров в одном камне.' },
    artifact_guild_seal: { type: 'artifact', name: 'Печать гильдии', rarity: 'rare', icon: '🔱', desc: 'Знак уважения гильдии.' },
    artifact_dragon_heart: { type: 'artifact', name: 'Сердце дракона', rarity: 'epic', icon: '❤️‍🔥', desc: 'Пылает у тех, кто достиг 10 уровня.' },
    artifact_shadow_crown: { type: 'artifact', name: 'Корона теней', rarity: 'legendary', icon: '👑', desc: 'Носит лишь Монарх.' }
  };

  // Награды за уровень (открываются сами, без квеста)
  var LEVEL_REWARDS = [
    { level: 1, rewards: ['frame_common', 'title_rank_e'] },
    { level: 5, rewards: ['title_rank_d'] },
    { level: 10, rewards: ['title_rank_c', 'artifact_dragon_heart'] },
    { level: 15, rewards: ['title_rank_b'] },
    { level: 20, rewards: ['title_rank_a', 'frame_flame'] },
    { level: 30, rewards: ['title_rank_s'] },
    { level: 40, rewards: ['title_monarch', 'artifact_shadow_crown'] }
  ];

  // ───────── квесты ─────────
  // metric — откуда берётся прогресс (см. metrics()); daily — можно выполнять раз в день
  var QUESTS = [
    { id: 'daily', daily: true, title: 'Ежедневная тренировка Игрока', desc: 'Загляните в Систему и отметьтесь. Серия дней даёт бонус опыта.', metric: 'daily', target: 1, exp: 50 },
    { id: 'awaken', title: 'Первое пробуждение', desc: 'Задайте свой никнейм в настройках профиля.', metric: 'nickname', target: 1, exp: 100, rewards: ['title_awakened', 'artifact_mana_crystal'] },
    { id: 'gates_5', title: 'Покоритель врат I', desc: 'Соберите 5 тайтлов: избранное, коллекция AnimeVerse или отметки просмотра.', metric: 'collection', target: 5, exp: 100, rewards: ['artifact_gate_key'] },
    { id: 'gates_15', title: 'Покоритель врат II', desc: 'Соберите 15 тайтлов в коллекции.', metric: 'collection', target: 15, exp: 200, rewards: ['frame_crimson'] },
    { id: 'gates_30', title: 'Покоритель врат III', desc: 'Соберите 30 тайтлов в коллекции.', metric: 'collection', target: 30, exp: 350, rewards: ['title_gate_conqueror'] },
    { id: 'gates_50', title: 'Покоритель врат IV', desc: 'Соберите 50 тайтлов в коллекции.', metric: 'collection', target: 50, exp: 600, rewards: ['frame_shadow'] },
    { id: 'watched_1', title: 'Первый пройденный мир', desc: 'Отметьте просмотр хотя бы одного аниме.', metric: 'watched', target: 1, exp: 50, rewards: ['artifact_scroll'] },
    { id: 'watched_10', title: 'Летописец', desc: 'Отметьте просмотр 10 аниме.', metric: 'watched', target: 10, exp: 250, rewards: ['title_chronicler'] },
    { id: 'guild_1', title: 'Голос гильдии', desc: 'Напишите сообщение в чат сообщества.', metric: 'chat', target: 1, exp: 80, rewards: ['title_guild_voice'] },
    { id: 'guild_10', title: 'Глас гильдии', desc: 'Напишите 10 сообщений в чат сообщества.', metric: 'chat', target: 10, exp: 250, rewards: ['artifact_guild_seal'] },
    { id: 'scout', title: 'Разведка', desc: 'Загляните в каталог и в график выхода аниме.', metric: 'scout', target: 2, exp: 60, rewards: ['artifact_dungeon_map'] },
    { id: 'genres_5', title: 'Знаток жанров', desc: 'Посетите 5 разных страниц жанров.', metric: 'genres', target: 5, exp: 120, rewards: ['artifact_rune'] },
    { id: 'streak_7', title: 'Неделя тренировок', desc: 'Выполните ежедневную тренировку 7 раз.', metric: 'dailyTotal', target: 7, exp: 300, rewards: ['frame_epic', 'title_tireless'] }
  ];

  // ───────── посещения разделов (для квестов «Разведка» и «Знаток жанров») ─────────
  var VISITS_KEY = 'animeverse_visits';
  function readVisits() {
    try { var v = JSON.parse(localStorage.getItem(VISITS_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; }
  }
  function recordVisit() {
    var path = location.pathname.toLowerCase();
    var v = readVisits();
    var changed = false;
    if (/\/movies\.html$/.test(path) && !v.catalog) { v.catalog = 1; changed = true; }
    if (/\/news\.html$/.test(path) && location.hash === '#schedule' && !v.schedule) { v.schedule = 1; changed = true; }
    if (document.querySelector('.anime-list') && /\/pages\/[a-z-]+\.html$/.test(path) && !/(favorites|movies|news|content|contacts|chat|profile|login|page\d?)\.html$/.test(path)) {
      var page = path.split('/').pop();
      v.genres = Array.isArray(v.genres) ? v.genres : [];
      if (v.genres.indexOf(page) === -1) { v.genres.push(page); changed = true; }
    }
    if (changed) { try { localStorage.setItem(VISITS_KEY, JSON.stringify(v)); } catch (e) {} }
  }
  // график выхода — блок на странице новостей: засчитываем, когда до него докрутили
  function watchScheduleVisit() {
    var sec = document.getElementById('schedule');
    if (!sec || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) {
        var v = readVisits();
        if (!v.schedule) { v.schedule = 1; try { localStorage.setItem(VISITS_KEY, JSON.stringify(v)); } catch (e) {} }
        io.disconnect();
      }
    });
    io.observe(sec);
  }

  // ───────── вычисления ─────────
  function todayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function yesterdayKey() { var d = new Date(); d.setDate(d.getDate() - 1); return todayKey(d); }

  function readLocalList(key) {
    try { var v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  var norm = function (t) { return String(t || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); };

  // Коллекция Игрока: AnimeVerse (users.anime) + избранное сайта + отметки просмотра, без повторов
  function collectionCount(p) {
    var seen = {};
    (Array.isArray(p.anime) ? p.anime : []).forEach(function (a) { if (a && a.title) seen['t:' + norm(a.title)] = 1; });
    readLocalList('favorites').forEach(function (t) { if (typeof t === 'string' && t) seen['t:' + norm(t)] = 1; });
    readLocalList('favorite_movies').forEach(function (id) { if (id) seen['m:' + id] = 1; });
    (Array.isArray(p.watched) ? p.watched : []).forEach(function (w) { if (w && w.title) seen['t:' + norm(w.title)] = 1; });
    return Object.keys(seen).length;
  }

  function metrics(p, extra) {
    var v = readVisits();
    return {
      daily: p.lastDailyClaim === todayKey() ? 1 : 0,
      nickname: p.username && String(p.username).trim().length >= 2 ? 1 : 0,
      collection: collectionCount(p),
      watched: Array.isArray(p.watched) ? p.watched.length : 0,
      chat: extra && extra.chatCount || 0,
      scout: (v.catalog ? 1 : 0) + (v.schedule ? 1 : 0),
      genres: Array.isArray(v.genres) ? v.genres.length : 0,
      dailyTotal: p.dailyTotal || 0
    };
  }

  // Состояние каждого квеста: value / target, done, claimed
  function questStates(p, extra) {
    var m = metrics(p, extra);
    var claimed = p.claimedQuests || {};
    return QUESTS.map(function (q) {
      var value = Math.min(m[q.metric] || 0, q.target);
      var isClaimed = q.daily ? p.lastDailyClaim === todayKey() : !!claimed[q.id];
      return { quest: q, value: value, done: q.daily ? !isClaimed : value >= q.target, claimed: isClaimed };
    });
  }

  // Открытые награды: по уровню + за полученные квесты
  function computeUnlocked(p) {
    var lv = levelInfo(p.exp).level;
    var set = {};
    LEVEL_REWARDS.forEach(function (r) { if (lv >= r.level) r.rewards.forEach(function (id) { set[id] = 1; }); });
    var claimed = p.claimedQuests || {};
    QUESTS.forEach(function (q) { if (claimed[q.id] && q.rewards) q.rewards.forEach(function (id) { set[id] = 1; }); });
    return Object.keys(set);
  }

  // Где взять награду (для заблокированных в инвентаре)
  function rewardSource(id) {
    for (var i = 0; i < LEVEL_REWARDS.length; i++) if (LEVEL_REWARDS[i].rewards.indexOf(id) !== -1) return 'Достичь ' + LEVEL_REWARDS[i].level + ' уровня';
    for (var j = 0; j < QUESTS.length; j++) if ((QUESTS[j].rewards || []).indexOf(id) !== -1) return 'Квест «' + QUESTS[j].title + '»';
    return '';
  }

  // ───────── Firestore ─────────
  function services() {
    if (!window.AnimeChat || !window.AnimeChat.services) return Promise.reject(new Error('Нет модуля js/chat-core.js'));
    return window.AnimeChat.services();
  }

  function load(uid) {
    return services().then(function (s) {
      return s.db.collection('users').doc(uid).get().then(function (snap) { return snap.exists ? snap.data() : {}; });
    });
  }

  // Только merge: не затираем коллекцию AnimeVerse и другие поля профиля
  function save(uid, patch) {
    return services().then(function (s) {
      patch.playerUpdatedAt = s.firebase.firestore.FieldValue.serverTimestamp();
      return s.db.collection('users').doc(uid).set(patch, { merge: true });
    });
  }

  function chatCount(uid) {
    return services().then(function (s) {
      return s.db.collection('chat_messages').where('uid', '==', uid).limit(10).get().then(function (q) { return q.size; });
    }).catch(function () { return 0; });
  }

  // Кэш для мгновенной мини-карточки в шапке
  var CHIP_KEY = 'animeverse_player';
  function chipData(uid, p, user) {
    var info = levelInfo(p.exp);
    return {
      uid: uid,
      name: String(p.username || (user && user.displayName) || 'Игрок').slice(0, 24),
      level: info.level,
      rank: rankFor(info.level).short,
      frame: p.selectedFrame && REWARDS[p.selectedFrame] ? p.selectedFrame : 'frame_common',
      photo: user && /^https:\/\//.test(user.photoURL || '') ? user.photoURL : null
    };
  }
  function publish(data) {
    try { localStorage.setItem(CHIP_KEY, JSON.stringify(data)); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('animeverse:player', { detail: data })); } catch (e) {}
  }
  function cached() {
    try { return JSON.parse(localStorage.getItem(CHIP_KEY) || 'null'); } catch (e) { return null; }
  }
  function clearCache() { try { localStorage.removeItem(CHIP_KEY); } catch (e) {} }

  recordVisit();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchScheduleVisit);
  else watchScheduleVisit();

  window.AnimePlayer = {
    RANKS: RANKS, REWARDS: REWARDS, QUESTS: QUESTS, LEVEL_REWARDS: LEVEL_REWARDS,
    expToNext: expToNext, levelInfo: levelInfo, rankFor: rankFor,
    questStates: questStates, computeUnlocked: computeUnlocked, rewardSource: rewardSource,
    collectionCount: collectionCount, todayKey: todayKey, yesterdayKey: yesterdayKey,
    services: services, load: load, save: save, chatCount: chatCount,
    chipData: chipData, publish: publish, cached: cached, clearCache: clearCache,
    readVisits: readVisits
  };
})();
