/* Уведомления Игрока — единая лента со всего сайта (колокольчик в шапке и блок в pages/profile.html).
 *
 * Категории: quest — задания Системы; reward — награды, рамки, аватарки, звания, LEVEL UP и ранги;
 *            episode — новые серии, премьеры и сезоны по расписанию (data/schedule.json); site — события сайта.
 * Каждое событие имеет уникальный ключ (id) — повторно оно не добавляется (защита от дублей),
 * а статус «прочитано» сохраняется.
 *
 * Хранение: локальный кэш localStorage (мгновенно, на всех вкладках) + users/{uid}.notifications
 * в Firestore через set(..., { merge: true }) — поля AnimeVerse и профиля не затрагиваются.
 *
 *   AnimeNotify.attach(uid, playerDoc)  — включить ленту для вошедшего (вызывает js/player-chip.js и профиль)
 *   AnimeNotify.push(items)             — добавить события [{ id, cat, icon, title, text, href }]
 *   AnimeNotify.list(cat) / unread()    — лента / число непрочитанных
 *   AnimeNotify.markRead(id) / markAllRead() / clearRead()
 *   AnimeNotify.render(box, opts)       — вывести ленту с фильтрами в контейнер
 *   AnimeNotify.onChange(cb)
 * Нужны js/chat-core.js (Firebase) и js/player-core.js (квесты, награды).
 */
(function () {
  'use strict';
  if (window.AnimeNotify) return;

  var MAX = 80;                        // сколько событий хранить
  var EP_WINDOW = 72 * 3600;           // «новая серия» — вышла не раньше 3 суток назад
  var SOON_EP = 24 * 3600;             // серия из коллекции выйдет в ближайшие 24 ч — предупреждаем заранее
  var REST_LIMIT = 8;                  // не из коллекции — не больше 8 свежих событий расписания
  var SOON_WINDOW = 7 * 24 * 3600;     // «скоро премьера/сезон» — в ближайшие 7 дней
  var CHECK_EVERY = 20 * 60 * 1000;    // расписание и квесты перепроверяются не чаще раза в 20 мин
  var CATS = { quest: 'Задания', reward: 'Награды', episode: 'Серии', site: 'Сайт' };
  var CAT_ICONS = { quest: '📜', reward: '🎁', episode: '📺', site: '📣' };

  // События самого сайта (новые разделы и возможности) — показываются каждому игроку один раз.
  // Основной список — data/site-events.json на Firebase Hosting (правится без изменения кода);
  // этот — запасной, если файл не загрузился.
  var SITE_EVENTS = [
    { id: 'site:profile', icon: '⚔️', title: 'Открыт Терминал Системы', text: 'Квесты, уровни, звания, рамки-порталы и аватарки — в профиле Игрока.', page: 'pages/profile.html', at: '2026-11-26T12:00:00Z' },
    { id: 'site:schedule', icon: '📅', title: 'График выхода аниме', text: 'Новые серии онгоингов, премьеры и сезоны — с таймерами до выхода.', page: 'pages/news.html#schedule', at: '2026-11-26T10:00:00Z' },
    { id: 'site:chat', icon: '💬', title: 'Чат сообщества', text: 'Общайтесь с другими фанатами в реальном времени.', page: 'pages/chat.html', at: '2026-11-25T12:00:00Z' }
  ];

  var uid = null, player = null;
  var chatN = null;           // число сообщений Игрока в чате (для квестов гильдии), null — ещё не известно
  var items = [];
  var gone = {};              // ключи очищенных уведомлений — повторно не появятся
  var listeners = [];
  var saveTimer = null;
  var ROOT = (window.AnimeChat && window.AnimeChat.ROOT) || new URL('../', (document.currentScript && document.currentScript.src) || location.href).href;

  function key() { return 'animeverse_notify_' + uid; }
  function now() { return Date.now(); }
  var norm = function (t) { return String(t || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); };

  function sanitize(it) {
    if (!it || typeof it.id !== 'string' || !CATS[it.cat]) return null;
    return {
      id: it.id.slice(0, 120),
      cat: it.cat,
      icon: String(it.icon || CAT_ICONS[it.cat]).slice(0, 8),
      title: String(it.title || '').slice(0, 120),
      text: String(it.text || '').slice(0, 240),
      href: typeof it.href === 'string' && !/^\s*javascript:/i.test(it.href) ? it.href.slice(0, 300) : '',
      at: Number(it.at) || now(),
      read: !!it.read,
      fav: !!it.fav
    };
  }

  function sortItems() {
    items.sort(function (a, b) { return b.at - a.at; });
    if (items.length > MAX) items = items.slice(0, MAX);
  }

  function emit() { listeners.forEach(function (cb) { try { cb(); } catch (e) { console.error(e); } }); }

  function goneList() { return Object.keys(gone).slice(-300); }
  function saveLocal() {
    try {
      localStorage.setItem(key(), JSON.stringify(items));
      localStorage.setItem(key() + '_gone', JSON.stringify(goneList()));
    } catch (e) {}
  }
  function loadLocal() {
    try { (JSON.parse(localStorage.getItem(key() + '_gone') || '[]') || []).forEach(function (id) { gone[id] = 1; }); } catch (e) {}
    try { var v = JSON.parse(localStorage.getItem(key()) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }

  // В Firestore — с задержкой, одной записью на пачку изменений
  function saveRemote() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      if (!uid || !window.AnimePlayer) return;
      window.AnimePlayer.save(uid, { notifications: items, notificationsCleared: goneList() }).catch(function () { /* офлайн — останется в кэше */ });
    }, 1500);
  }

  function commit(remote) { sortItems(); saveLocal(); if (remote !== false) saveRemote(); emit(); }

  // Объединение: по id; «прочитано» побеждает, раньше полученное время сохраняется
  function merge(list) {
    var byId = {};
    items.forEach(function (it) { byId[it.id] = it; });
    var added = 0;
    (list || []).forEach(function (raw) {
      var it = sanitize(raw);
      if (!it || gone[it.id]) return;
      var cur = byId[it.id];
      if (cur) { cur.read = cur.read || it.read; cur.at = Math.min(cur.at, it.at); cur.fav = cur.fav || it.fav; }
      else { byId[it.id] = it; items.push(it); added++; }
    });
    return added;
  }

  function push(list) {
    if (!uid) return 0;
    var added = merge(list);
    if (added) commit();
    return added;
  }

  // ───────── источники ─────────
  function href(page) { return /^https?:/i.test(page) ? page : ROOT + page; }

  // Событие с датой в будущем — анонс по расписанию: появится в ленте, когда наступит его время
  function siteEvents(list) {
    return (list || SITE_EVENTS).filter(function (e) {
      var at = Date.parse(e && e.at);
      return e && typeof e.id === 'string' && /^site:/.test(e.id) && e.title && at && at <= now();
    }).map(function (e) {
      return { id: e.id, cat: 'site', icon: e.icon, title: e.title, text: e.text, href: e.page ? href(e.page) : '', at: Date.parse(e.at) };
    });
  }

  // Готовые к получению награды квесты (уведомление «Квест выполнен») — по данным профиля
  function questEvents(p) {
    var P = window.AnimePlayer;
    if (!P || !p) return [];
    var today = P.todayKey();
    return P.questStates(p, { chatCount: chatN != null ? chatN : (p.__chatCount || 0) }).filter(function (s) { return s.done && !s.claimed; }).map(function (s) {
      var q = s.quest;
      return {
        id: 'quest-ready:' + q.id + (q.daily ? ':' + today : ''),
        cat: 'quest', icon: q.daily ? '⏰' : '📜',
        title: q.daily ? 'Ежедневная тренировка ждёт' : 'Можно забрать награду: «' + q.title + '»',
        text: q.daily ? 'Заберите ежедневные EXP — серия дней даёт бонус.' : 'Условие квеста выполнено. Заберите +' + q.exp + ' EXP в Терминале Системы.',
        href: href('pages/profile.html')
      };
    });
  }

  // Названия из избранного и коллекции Игрока — у их серий приоритет и метка ★
  function favoriteKeys(p) {
    var set = {};
    function add(t) { var k = norm(t); if (k) set[k] = 1; }
    try { (JSON.parse(localStorage.getItem('favorites') || '[]') || []).forEach(add); } catch (e) {}
    (p && Array.isArray(p.anime) ? p.anime : []).forEach(function (a) { if (a) { add(a.title); add(a.titleEn); } });
    (p && Array.isArray(p.watched) ? p.watched : []).forEach(function (w) { if (w) add(w.title); });
    return set;
  }
  function isFav(it, favs) {
    return [it.title, it.titleEnglish, it.titleOriginal, it.franchise, it.prequel && it.prequel.title].some(function (t) {
      var k = norm(t);
      if (!k) return false;
      if (favs[k]) return true;
      // «Магическая битва 2» ↔ «Магическая битва»
      return Object.keys(favs).some(function (f) { return f.length >= 4 && (k.indexOf(f) === 0 || f.indexOf(k) === 0); });
    });
  }

  function scheduleEvents(data, p) {
    var t = now() / 1000;
    var favs = favoriteKeys(p);
    var out = [];
    var linkFor = function (it) { return it.catalogId ? href('pages/content.html?anime=' + encodeURIComponent(it.catalogId)) : href('pages/news.html#schedule'); };
    // вышедшие серии онгоингов: следующая серия из файла уже вышла (или вышла предыдущая неделю назад)
    (data.ongoing || []).forEach(function (it) {
      if (!it.airingAt || !it.nextEpisode) return;
      var at = it.airingAt, ep = it.nextEpisode;
      while (at + 7 * 86400 <= t) { at += 7 * 86400; ep++; }   // файл устарел — считаем по неделям
      var fav = isFav(it, favs);
      if (at > t) {
        // серия из коллекции выходит в ближайшие сутки — отдельное напоминание
        if (fav && at - t <= SOON_EP && !(it.episodes && ep > it.episodes)) {
          out.push({ id: 'ep-soon:' + it.anilistId + ':' + ep, cat: 'episode', icon: '⏳', fav: true,
            title: 'Скоро серия ' + ep + ' — «' + it.title + '»',
            text: 'Выйдет ' + new Date(at * 1000).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) + '.',
            href: linkFor(it), at: now() });
        }
        at -= 7 * 86400; ep--;                                     // предыдущая серия — вышла неделю назад
        if (ep < 1 || at > t) return;                             // перерыв в показе — прошлой серии на этой неделе не было
      }
      if (t - at > EP_WINDOW) return;
      if (it.episodes && ep > it.episodes) return;
      out.push({ id: 'ep:' + it.anilistId + ':' + ep, cat: 'episode', icon: fav ? '⭐' : '📺', fav: fav,
        title: (fav ? 'Из вашей коллекции: ' : 'Вышла ') + 'серия ' + ep + ' — «' + it.title + '»',
        text: 'Новая серия онгоинга уже доступна' + (it.episodes ? ' (' + ep + ' из ' + it.episodes + ')' : '') + '.',
        href: linkFor(it), at: at * 1000 });
    });
    // скоро стартуют: премьеры и новые сезоны в ближайшие 7 дней
    [['premieres', 'Премьера'], ['sequels', 'Новый сезон']].forEach(function (pair) {
      (data[pair[0]] || []).forEach(function (it) {
        var start = it.airingAt || (it.startDate && it.startDate.day ? Date.UTC(it.startDate.year, it.startDate.month - 1, it.startDate.day) / 1000 : 0);
        if (!start || start < t - EP_WINDOW || start - t > SOON_WINDOW) return;
        var fav = isFav(it, favs);
        var started = start <= t;
        out.push({ id: (pair[0] === 'premieres' ? 'premiere:' : 'season:') + it.anilistId, cat: 'episode', icon: fav ? '⭐' : (pair[0] === 'premieres' ? '✨' : '🔁'), fav: fav,
          title: pair[1] + (started ? ' стартовала: ' : ' скоро: ') + '«' + it.title + '»',
          text: started ? 'Первая серия уже вышла.' : 'Старт ' + new Date(start * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) + '.',
          href: linkFor(it), at: Math.min(start * 1000, now()) });
      });
    });
    // приоритет — тайтлы из коллекции; из остальных — не больше 6 свежих, чтобы не засыпать ленту
    var favOnes = out.filter(function (e) { return e.fav; });
    var rest = out.filter(function (e) { return !e.fav; }).sort(function (a, b) { return b.at - a.at; }).slice(0, REST_LIMIT);
    return favOnes.concat(rest);
  }

  function checkSchedule(force) {
    var stamp = 'animeverse_notify_check_' + uid;
    var last = 0;
    try { last = Number(sessionStorage.getItem(stamp)) || 0; } catch (e) {}
    if (!force && now() - last < CHECK_EVERY) return;
    var forUid = uid;
    // статичные JSON с Firebase Hosting (cache: no-cache — браузер сверяет ETag, тело качается только при изменении)
    var getJson = function (file) {
      return fetch(ROOT + 'data/' + file, { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    };
    Promise.all([getJson('schedule.json'), getJson('site-events.json')]).then(function (res) {
      if (!uid || uid !== forUid) return;
      var schedule = res[0], site = res[1];
      var list = [];
      if (site && Array.isArray(site.events)) list = list.concat(siteEvents(site.events));
      if (schedule && (schedule.ongoing || schedule.premieres || schedule.sequels)) {
        list = list.concat(scheduleEvents(schedule, player));
        try { sessionStorage.setItem(stamp, String(now())); } catch (e) {}
      }
      if (list.length) push(list);
    });
  }

  // ───────── включение для вошедшего ─────────
  // «Можно забрать награду» для уже полученного квеста (на другой вкладке/устройстве) или вчерашней
  // ежедневной тренировки — отмечаем прочитанным, чтобы бейдж не висел зря.
  function settleQuests(p) {
    var P = window.AnimePlayer;
    if (!P || !p) return false;
    var today = P.todayKey();
    var claimed = p.claimedQuests || {};
    var changed = false;
    items.forEach(function (it) {
      if (it.read || it.id.indexOf('quest-ready:') !== 0) return;
      var parts = it.id.split(':');               // quest-ready:<id>[:<день>]
      var stale = parts[2] ? (parts[2] !== today || p.lastDailyClaim === today) : !!claimed[parts[1]];
      if (stale) { it.read = true; changed = true; }
    });
    return changed;
  }

  function resetFor(newUid) {
    uid = newUid; player = null; chatN = null; items = []; gone = {};
    merge(loadLocal());
  }

  // Мгновенно — только из локального кэша (до ответа Firestore; в облако ничего не пишет)
  function attachLocal(newUid) {
    if (!newUid || uid === newUid) return;
    resetFor(newUid);
    merge(siteEvents());
    sortItems();
    saveLocal();
    emit();
    checkSchedule(false);
  }

  // Полная лента — по документу users/{uid}
  function attach(newUid, doc) {
    if (!newUid) return;
    if (uid !== newUid) resetFor(newUid);
    player = Object.assign({}, player || {}, doc || {});
    if (player.__chatCount != null) chatN = player.__chatCount;
    (Array.isArray(player.notificationsCleared) ? player.notificationsCleared : []).forEach(function (id) { if (typeof id === 'string') gone[id] = 1; });
    var before = items.length;
    merge(Array.isArray(player.notifications) ? player.notifications : []);
    merge(siteEvents());
    merge(questEvents(player));
    var settled = settleQuests(player);
    commit(settled || items.length !== before || !Array.isArray(player.notifications));
    checkSchedule(false);
  }

  // Пересчитать квесты (стало известно число сообщений в чате, изменились посещения и т. п.)
  function refreshQuests(extra) {
    if (extra && extra.chatCount != null) chatN = extra.chatCount;
    if (!uid || !player) return;
    var added = merge(questEvents(player));
    var settled = settleQuests(player);
    if (added || settled) commit();
  }

  function detach() { uid = null; player = null; chatN = null; items = []; gone = {}; emit(); }

  // ───────── чтение ─────────
  function markRead(id) {
    var it = items.filter(function (x) { return x.id === id; })[0];
    if (it && !it.read) { it.read = true; commit(); }
  }
  function markAllRead() {
    var changed = false;
    items.forEach(function (it) { if (!it.read) { it.read = true; changed = true; } });
    if (changed) commit();
  }
  function clearRead() {
    var n = items.length;
    items.forEach(function (it) { if (it.read) gone[it.id] = 1; });
    items = items.filter(function (it) { return !it.read; });
    if (items.length !== n) commit();
  }
  function list(cat) { return items.filter(function (it) { return !cat || cat === 'all' || it.cat === cat || (cat === 'reward' && it.cat === 'reward'); }); }
  function unread() { return items.filter(function (it) { return !it.read; }).length; }
  function onChange(cb) { listeners.push(cb); }

  // другие вкладки: обновили ленту
  window.addEventListener('storage', function (e) {
    if (!uid || e.key !== key()) return;
    items = [];
    gone = {};
    merge(loadLocal());
    sortItems();
    emit();
  });

  // ───────── вывод ─────────
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function ago(ms) {
    var s = Math.max(0, (now() - ms) / 1000);
    if (s < 60) return 'только что';
    if (s < 3600) return Math.floor(s / 60) + ' мин назад';
    if (s < 86400) return Math.floor(s / 3600) + ' ч назад';
    if (s < 7 * 86400) return Math.floor(s / 86400) + ' дн назад';
    return new Date(ms).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }

  // Лента с фильтрами «Все / Задания / Награды / Серии» и кнопками прочтения
  function render(box, opts) {
    opts = opts || {};
    var state = { cat: 'all' };
    box.classList.add('nt-box');
    function draw() {
      box.replaceChildren();
      var head = el('div', 'nt-head');
      var tabs = el('div', 'nt-tabs');
      tabs.setAttribute('role', 'group');
      tabs.setAttribute('aria-label', 'Категории уведомлений');
      [['all', 'Все'], ['quest', 'Задания'], ['reward', 'Награды'], ['episode', 'Серии']].forEach(function (t) {
        var b = el('button', 'nt-tab', t[1]);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(state.cat === t[0]));
        var n = items.filter(function (it) { return !it.read && (t[0] === 'all' || it.cat === t[0] || (t[0] === 'episode' && it.cat === 'site')); }).length;
        if (n) b.appendChild(el('span', 'nt-tab-count', String(n)));
        b.addEventListener('click', function () { state.cat = t[0]; draw(); });
        tabs.appendChild(b);
      });
      head.appendChild(tabs);
      box.appendChild(head);

      // «Серии» включает и события сайта (новости и новые разделы)
      var shown = items.filter(function (it) { return state.cat === 'all' || it.cat === state.cat || (state.cat === 'episode' && it.cat === 'site'); });
      var ul = el('ul', 'nt-list');
      if (!shown.length) ul.appendChild(el('li', 'nt-empty', uid ? 'Уведомлений пока нет' : 'Войдите, чтобы получать уведомления Системы'));
      shown.slice(0, opts.limit || MAX).forEach(function (it) {
        var li = el('li', 'nt-item' + (it.read ? '' : ' is-unread') + (it.fav ? ' is-fav' : ''));
        var a = el(it.href ? 'a' : 'div', 'nt-link');
        if (it.href) a.href = it.href;
        a.addEventListener('click', function () { markRead(it.id); });
        var ic = el('span', 'nt-icon', it.icon);
        ic.setAttribute('aria-hidden', 'true');
        var body = el('span', 'nt-body');
        var meta = el('span', 'nt-meta');
        meta.append(el('span', 'nt-cat nt-cat-' + it.cat, CATS[it.cat]), el('time', 'nt-time', ago(it.at)));
        body.append(el('b', 'nt-title', it.title), el('span', 'nt-text', it.text), meta);
        a.append(ic, body);
        li.appendChild(a);
        ul.appendChild(li);
      });
      box.appendChild(ul);

      var foot = el('div', 'nt-foot');
      var all = el('button', 'nt-btn', 'Отметить всё прочитанным');
      all.type = 'button';
      all.disabled = !unread();
      all.addEventListener('click', markAllRead);
      var clear = el('button', 'nt-btn ghost', 'Очистить прочитанные');
      clear.type = 'button';
      clear.disabled = !items.some(function (it) { return it.read; });
      clear.addEventListener('click', clearRead);
      foot.append(all, clear);
      if (opts.moreHref) { var more = el('a', 'nt-more', 'Все уведомления →'); more.href = opts.moreHref; foot.appendChild(more); }
      box.appendChild(foot);
    }
    draw();
    onChange(draw);
    return { redraw: draw };
  }

  window.AnimeNotify = {
    attach: attach, attachLocal: attachLocal, refreshQuests: refreshQuests, detach: detach, push: push, list: list, unread: unread,
    markRead: markRead, markAllRead: markAllRead, clearRead: clearRead,
    onChange: onChange, render: render, checkSchedule: checkSchedule,
    questEvents: questEvents, isAttached: function () { return !!uid; }, hasPlayer: function () { return !!player; }, CATS: CATS
  };
})();
