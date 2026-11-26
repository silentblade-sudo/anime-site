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
  // type: frame | title | artifact | avatar; rarity: common | rare | epic | legendary
  // Звания — только за заслуги: ни одно не выдаётся просто так, у каждого есть квест или уровень.
  var REWARDS = {
    // рамки-порталы (CSS-классы pf-frame-* в css/player.css)
    frame_common: { type: 'frame', name: 'Обычная рамка', rarity: 'common', icon: '⬛', desc: 'Строгий тёмно-стальной контур пробуждённого.' },
    frame_crimson: { type: 'frame', name: 'Алые врата', rarity: 'rare', icon: '🟥', desc: 'Глубокий багровый портал с дыханием энергии.' },
    frame_epic: { type: 'frame', name: 'Разлом Бездны', rarity: 'epic', icon: '🌀', desc: 'Затягивающий тёмно-алый вихрь с вращающимся кольцом.' },
    frame_shadow: { type: 'frame', name: 'Теневой портал', rarity: 'legendary', icon: '🌑', desc: 'Многослойная аура теней из глубины врат.' },
    frame_flame: { type: 'frame', name: 'Пламя Монарха', rarity: 'legendary', icon: '🔥', desc: 'Живой огненно-алый контур с потоками энергии и искрами.' },
    // аватарки (img/avatars/, рисует tools/build-avatars.mjs); cat: heroine | hunter | special
    avatar_initial: { type: 'avatar', cat: 'special', name: 'Инициал', rarity: 'common', icon: '🔤', desc: 'Первая буква ника — запасной вариант.' },
    avatar_awakened_hunter: { type: 'avatar', cat: 'hunter', file: 'awakened-hunter.svg', name: 'Пробуждённый охотник', rarity: 'common', desc: 'Только что прошёл через алые врата.' },
    avatar_night_blade: { type: 'avatar', cat: 'hunter', file: 'night-blade.svg', name: 'Ночной клинок', rarity: 'common', desc: 'Тень в капюшоне с клинком за спиной.' },
    avatar_scarlet_valkyrie: { type: 'avatar', cat: 'heroine', file: 'scarlet-valkyrie.svg', name: 'Алая валькирия', rarity: 'rare', desc: 'Крылатая воительница в серебряных доспехах.' },
    avatar_night_kitsune: { type: 'avatar', cat: 'heroine', file: 'night-kitsune.svg', name: 'Ночная кицунэ', rarity: 'rare', desc: 'Лисица-оборотень у врат Бездны.' },
    avatar_system_neophyte: { type: 'avatar', cat: 'hunter', file: 'system-neophyte.svg', name: 'Неофит Системы', rarity: 'rare', desc: 'Руны Системы признали нового игрока.' },
    avatar_crimson_swordswoman: { type: 'avatar', cat: 'heroine', file: 'crimson-swordswoman.svg', name: 'Алая мечница', rarity: 'rare', desc: 'Клинок, закалённый в багровом свете.' },
    avatar_world_wanderer: { type: 'avatar', cat: 'heroine', file: 'world-wanderer.svg', name: 'Странница миров', rarity: 'rare', desc: 'Прошла через первые изумрудные врата.' },
    avatar_chronicle_keeper: { type: 'avatar', cat: 'heroine', file: 'chronicle-keeper.svg', name: 'Хранительница хроник', rarity: 'epic', desc: 'Записывает истории всех пройденных миров.' },
    avatar_gate_guardian: { type: 'avatar', cat: 'hunter', file: 'gate-guardian.svg', name: 'Страж врат', rarity: 'rare', desc: 'Закованный в сталь страж фиолетового разлома.' },
    avatar_crimson_rose: { type: 'avatar', cat: 'heroine', file: 'crimson-rose.svg', name: 'Багровая роза', rarity: 'epic', desc: 'Серебровласая героиня в алых розах у багровых врат.' },
    avatar_abyss_lady: { type: 'avatar', cat: 'heroine', file: 'abyss-lady.svg', name: 'Леди Бездны', rarity: 'epic', desc: 'Рогатая владычица тёмного разлома.' },
    avatar_monarch_shade: { type: 'avatar', cat: 'hunter', file: 'monarch-shade.svg', name: 'Тень Монарха', rarity: 'legendary', desc: 'Воин из армии теней.' },
    avatar_shadow_empress: { type: 'avatar', cat: 'heroine', file: 'shadow-empress.svg', name: 'Императрица теней', rarity: 'legendary', desc: 'Корона из тьмы и фиолетового пламени.' },
    avatar_guild_herald: { type: 'avatar', cat: 'heroine', file: 'guild-herald.svg', name: 'Вестница гильдии', rarity: 'rare', desc: 'Её голос слышит вся гильдия.' },
    avatar_scarlet_oracle: { type: 'avatar', cat: 'heroine', file: 'scarlet-oracle.svg', name: 'Алый оракул', rarity: 'epic', desc: 'Провидица в алых розах.' },
    avatar_dawn_valkyrie: { type: 'avatar', cat: 'heroine', file: 'dawn-valkyrie.svg', name: 'Валькирия рассвета', rarity: 'epic', desc: 'Сияет после недели тренировок.' },
    avatar_dragon_heart: { type: 'avatar', cat: 'hunter', file: 'dragon-heart.svg', name: 'Сердце дракона', rarity: 'epic', desc: 'Охотник, в чьей груди горит драконье пламя.' },
    avatar_flame_priestess: { type: 'avatar', cat: 'heroine', file: 'flame-priestess.svg', name: 'Огненная жрица', rarity: 'legendary', desc: 'Служительница огненных врат.' },
    avatar_s_rank_goddess: { type: 'avatar', cat: 'heroine', file: 's-rank-goddess.svg', name: 'Богиня S-ранга', rarity: 'legendary', desc: 'Сияние, доступное лишь сильнейшим.' },
    avatar_shadow_monarch: { type: 'avatar', cat: 'hunter', file: 'shadow-monarch.svg', name: 'Монарх Теней', rarity: 'legendary', desc: 'Повелитель армии теней.' },
    // готические/монохромные героини — слоты pin-* (свои картинки: tools/avatar-sources/, см. README там)
    avatar_pin_white_reaper: { type: 'avatar', cat: 'heroine', file: 'pin-white-reaper.svg', name: 'Белая жница', rarity: 'rare', desc: 'Седые пряди, кружево и алые слёзы.' },
    avatar_pin_noir_gothic: { type: 'avatar', cat: 'heroine', file: 'pin-noir-gothic.svg', name: 'Готика нуар', rarity: 'rare', desc: 'Чёрное каре, кружево и розы в монохроме.' },
    avatar_pin_crimson_smile: { type: 'avatar', cat: 'heroine', file: 'pin-crimson-smile.svg', name: 'Алая усмешка', rarity: 'rare', desc: 'Дерзкая улыбка с клычком на фоне кровавой луны.' },
    avatar_pin_moon_witch: { type: 'avatar', cat: 'heroine', file: 'pin-moon-witch.svg', name: 'Лунная ведьма', rarity: 'epic', desc: 'Руны и вуаль у лиловых врат.' },
    avatar_pin_silver_vampire: { type: 'avatar', cat: 'heroine', file: 'pin-silver-vampire.svg', name: 'Серебряная вампирша', rarity: 'epic', desc: 'Серебро волос и алый взгляд.' },
    avatar_pin_bloody_lace: { type: 'avatar', cat: 'heroine', file: 'pin-bloody-lace.svg', name: 'Кровавое кружево', rarity: 'epic', desc: 'Белый хвост, алые розы и кружевной ворот.' },
    avatar_pin_raven_queen: { type: 'avatar', cat: 'heroine', file: 'pin-raven-queen.svg', name: 'Королева воронов', rarity: 'legendary', desc: 'Корона из тьмы и аура цвета запёкшейся крови.' },
    avatar_pin_mono_angel: { type: 'avatar', cat: 'heroine', file: 'pin-mono-angel.svg', name: 'Монохромный ангел', rarity: 'legendary', desc: 'Белые крылья, нимб и чёрно-белый мир.' },
    // личная аватарка владельца сайта: видна и доступна только аккаунту с этим UID (exclusive),
    // арт показывается целиком (fit: contain), без обрезки цепей и роз
    avatar_exclusive_crimson_moon: { type: 'avatar', cat: 'heroine', file: 'exclusive-crimson-moon.webp', fit: 'contain', exclusive: 'rZMCKbIfA3NZX7Nj1YiXCB4aib22', name: 'Алая луна', rarity: 'legendary', desc: 'Личная аватарка владельца Anime Fan Club.' },
    // звания (показываются под ником) — только за заслуги
    title_awakened: { type: 'title', name: 'Пробуждённый', rarity: 'common', icon: '✨', desc: 'Система признала нового игрока.' },
    title_guild_voice: { type: 'title', name: 'Голос гильдии', rarity: 'rare', icon: '📣', desc: 'Слово, услышанное гильдией.' },
    title_chronicler: { type: 'title', name: 'Летописец', rarity: 'rare', icon: '📖', desc: 'Хранитель историй десяти миров.' },
    title_gate_conqueror: { type: 'title', name: 'Покоритель врат', rarity: 'epic', icon: '🌀', desc: 'Тридцать миров покорены.' },
    title_tireless: { type: 'title', name: 'Неутомимый', rarity: 'epic', icon: '⚡', desc: 'Семь дней тренировок без устали.' },
    title_rank_d: { type: 'title', name: 'Охотник D-ранга', rarity: 'common', icon: '🎖️', desc: 'Первые шаги остались позади.' },
    title_rank_c: { type: 'title', name: 'Охотник C-ранга', rarity: 'rare', icon: '🎖️', desc: 'Опытный боец гильдии.' },
    title_rank_b: { type: 'title', name: 'Охотник B-ранга', rarity: 'rare', icon: '🎖️', desc: 'Сила, с которой считаются.' },
    title_rank_a: { type: 'title', name: 'Охотник A-ранга', rarity: 'epic', icon: '🏅', desc: 'Элита среди охотников.' },
    title_rank_s: { type: 'title', name: 'Охотник S-ранга', rarity: 'epic', icon: '🏅', desc: 'Сильнейшие из сильнейших.' },
    title_monarch: { type: 'title', name: 'Монарх Теней', rarity: 'legendary', icon: '👑', desc: 'Вершина Системы.' },
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

  var DEFAULT_AVATAR = 'avatar_awakened_hunter';

  // Награды за уровень (открываются сами); на 1-м — стартовые рамка и аватарки (без званий!)
  var LEVEL_REWARDS = [
    { level: 1, rewards: ['frame_common', 'avatar_awakened_hunter', 'avatar_night_blade', 'avatar_scarlet_valkyrie', 'avatar_night_kitsune', 'avatar_initial', 'avatar_pin_white_reaper', 'avatar_pin_noir_gothic', 'avatar_pin_crimson_smile'] },
    { level: 5, rewards: ['title_rank_d'] },
    { level: 10, rewards: ['title_rank_c', 'artifact_dragon_heart', 'avatar_dragon_heart'] },
    { level: 15, rewards: ['title_rank_b', 'avatar_pin_raven_queen'] },
    { level: 20, rewards: ['title_rank_a', 'frame_flame', 'avatar_flame_priestess'] },
    { level: 25, rewards: ['avatar_pin_mono_angel'] },
    { level: 30, rewards: ['title_rank_s', 'avatar_s_rank_goddess'] },
    { level: 40, rewards: ['title_monarch', 'artifact_shadow_crown', 'avatar_shadow_monarch'] }
  ];

  // ───────── квесты ─────────
  // metric — откуда берётся прогресс (см. metrics()); daily — можно выполнять раз в день
  var QUESTS = [
    { id: 'daily', daily: true, title: 'Ежедневная тренировка Игрока', desc: 'Загляните в Систему и отметьтесь. Серия дней даёт бонус опыта.', metric: 'daily', target: 1, exp: 50 },
    { id: 'awaken', title: 'Первое пробуждение', desc: 'Задайте свой никнейм в настройках профиля.', metric: 'nickname', target: 1, exp: 100, rewards: ['title_awakened', 'artifact_mana_crystal', 'avatar_system_neophyte', 'avatar_crimson_swordswoman'] },
    { id: 'gates_5', title: 'Покоритель врат I', desc: 'Соберите 5 тайтлов: избранное, коллекция AnimeVerse или отметки просмотра.', metric: 'collection', target: 5, exp: 100, rewards: ['frame_crimson', 'artifact_gate_key', 'avatar_gate_guardian'] },
    { id: 'gates_15', title: 'Покоритель врат II', desc: 'Соберите 15 тайтлов в коллекции.', metric: 'collection', target: 15, exp: 200, rewards: ['avatar_crimson_rose'] },
    { id: 'gates_30', title: 'Покоритель врат III', desc: 'Соберите 30 тайтлов в коллекции.', metric: 'collection', target: 30, exp: 350, rewards: ['title_gate_conqueror', 'avatar_abyss_lady', 'avatar_pin_bloody_lace'] },
    { id: 'gates_50', title: 'Покоритель врат IV', desc: 'Соберите 50 тайтлов в коллекции.', metric: 'collection', target: 50, exp: 600, rewards: ['frame_shadow', 'avatar_monarch_shade', 'avatar_shadow_empress'] },
    { id: 'watched_1', title: 'Первый пройденный мир', desc: 'Отметьте просмотр хотя бы одного аниме.', metric: 'watched', target: 1, exp: 50, rewards: ['artifact_scroll', 'avatar_world_wanderer'] },
    { id: 'watched_10', title: 'Летописец', desc: 'Отметьте просмотр 10 аниме.', metric: 'watched', target: 10, exp: 250, rewards: ['title_chronicler', 'avatar_chronicle_keeper'] },
    { id: 'guild_1', title: 'Голос гильдии', desc: 'Напишите сообщение в чат сообщества.', metric: 'chat', target: 1, exp: 80, rewards: ['title_guild_voice', 'avatar_guild_herald'] },
    { id: 'guild_10', title: 'Глас гильдии', desc: 'Напишите 10 сообщений в чат сообщества.', metric: 'chat', target: 10, exp: 250, rewards: ['artifact_guild_seal', 'avatar_scarlet_oracle'] },
    { id: 'scout', title: 'Разведка', desc: 'Загляните в каталог и в график выхода аниме.', metric: 'scout', target: 2, exp: 60, rewards: ['artifact_dungeon_map', 'avatar_pin_moon_witch'] },
    { id: 'genres_5', title: 'Знаток жанров', desc: 'Посетите 5 разных страниц жанров.', metric: 'genres', target: 5, exp: 120, rewards: ['artifact_rune', 'avatar_pin_silver_vampire'] },
    { id: 'streak_7', title: 'Неделя тренировок', desc: 'Выполните ежедневную тренировку 7 раз.', metric: 'dailyTotal', target: 7, exp: 300, rewards: ['frame_epic', 'title_tireless', 'avatar_dawn_valkyrie'] }
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

  // ───────── эксклюзивы ─────────
  // Чей профиль сейчас открыт (uid вошедшего). Эксклюзивная награда видна и открыта только своему владельцу:
  // для остальных её нет ни в выборе, ни в инвентаре, ни в списках наград.
  var viewerUid = null;
  function setViewer(uid) { viewerUid = uid || null; }
  function isVisible(id, uid) {
    var r = REWARDS[id];
    if (!r) return false;
    if (!r.exclusive) return true;
    return (uid !== undefined ? uid : viewerUid) === r.exclusive;
  }
  function visibleRewardIds() { return Object.keys(REWARDS).filter(function (id) { return isVisible(id); }); }

  // Открытые награды: по уровню + за полученные квесты (+ личные эксклюзивы владельца)
  function computeUnlocked(p) {
    var lv = levelInfo(p.exp).level;
    var set = {};
    LEVEL_REWARDS.forEach(function (r) { if (lv >= r.level) r.rewards.forEach(function (id) { set[id] = 1; }); });
    var claimed = p.claimedQuests || {};
    QUESTS.forEach(function (q) { if (claimed[q.id] && q.rewards) q.rewards.forEach(function (id) { set[id] = 1; }); });
    Object.keys(REWARDS).forEach(function (id) { if (REWARDS[id].exclusive && isVisible(id)) set[id] = 1; });
    return Object.keys(set);
  }

  // Где взять награду (для заблокированных в инвентаре)
  function rewardSource(id) {
    if (REWARDS[id] && REWARDS[id].exclusive) return 'Личная награда владельца сайта';
    for (var i = 0; i < LEVEL_REWARDS.length; i++) if (LEVEL_REWARDS[i].rewards.indexOf(id) !== -1) return 'Достичь ' + LEVEL_REWARDS[i].level + ' уровня';
    for (var j = 0; j < QUESTS.length; j++) if ((QUESTS[j].rewards || []).indexOf(id) !== -1) return 'Квест «' + QUESTS[j].title + '»';
    return '';
  }

  // ───────── аватарки ─────────
  // Арт целиком (contain) или кадрированный портрет (cover)
  function avatarFit(id) { return REWARDS[id] && REWARDS[id].fit === 'contain' ? 'contain' : 'cover'; }

  function avatarUrl(id) {
    var r = REWARDS[id];
    if (!r || r.type !== 'avatar' || !r.file) return null;
    var root = window.AnimeChat && window.AnimeChat.ROOT ? window.AnimeChat.ROOT : new URL('../', document.currentScript ? document.currentScript.src : location.href).href;
    return root + 'img/avatars/' + r.file;
  }
  // Выбранное, но только если оно открыто; иначе — стартовое
  function pickUnlocked(p, field, type, fallback) {
    var id = p[field];
    if (id && REWARDS[id] && REWARDS[id].type === type && computeUnlocked(p).indexOf(id) !== -1) return id;
    return fallback;
  }
  function currentAvatar(p) { return pickUnlocked(p, 'selectedAvatar', 'avatar', DEFAULT_AVATAR); }
  function currentFrame(p) { return pickUnlocked(p, 'selectedFrame', 'frame', 'frame_common'); }
  function currentTitle(p) { return pickUnlocked(p, 'selectedTitle', 'title', null); }

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
    var prevViewer = viewerUid;
    viewerUid = uid; // эксклюзивы проверяются по владельцу этой карточки
    var avatar = currentAvatar(p), frame = currentFrame(p);
    viewerUid = prevViewer;
    return {
      uid: uid,
      name: String(p.username || (user && user.displayName) || 'Игрок').slice(0, 24),
      level: info.level,
      rank: rankFor(info.level).short,
      frame: frame,
      avatar: avatar,
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
    RANKS: RANKS, REWARDS: REWARDS, QUESTS: QUESTS, LEVEL_REWARDS: LEVEL_REWARDS, DEFAULT_AVATAR: DEFAULT_AVATAR,
    avatarUrl: avatarUrl, avatarFit: avatarFit, currentAvatar: currentAvatar,
    setViewer: setViewer, isVisible: isVisible, visibleRewardIds: visibleRewardIds, currentFrame: currentFrame, currentTitle: currentTitle,
    expToNext: expToNext, levelInfo: levelInfo, rankFor: rankFor,
    questStates: questStates, computeUnlocked: computeUnlocked, rewardSource: rewardSource,
    collectionCount: collectionCount, todayKey: todayKey, yesterdayKey: yesterdayKey,
    services: services, load: load, save: save, chatCount: chatCount,
    chipData: chipData, publish: publish, cached: cached, clearCache: clearCache,
    readVisits: readVisits
  };
})();
