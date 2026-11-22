/* Страница фестивалей и премьер (pages/news.html).
 *
 * Данные: справочник js/festivals-data.js (window.FESTIVALS) + живая коллекция Firestore `festivals`
 * (документ = событие, id документа = id события, поля — как в справочнике). Подписка onSnapshot:
 * правки в Firebase сразу появляются на странице. Если Firebase недоступен, коллекция пуста или
 * правила не дают читать — страница без ошибок работает на справочнике.
 *
 * Адрес: pages/news.html?id=<id события>. Выбор в списке или в календаре меняет ?id= без перезагрузки
 * (history.pushState), «Назад» возвращает предыдущее событие (popstate).
 *
 * Всё выводится через textContent — тексты из Firebase не могут вставить на страницу HTML.
 */
(function () {
  'use strict';

  var LOCAL = Array.isArray(window.FESTIVALS) ? window.FESTIVALS : [];
  var remote = {};            // id → событие из Firestore
  var events = [];            // справочник + Firestore, по дате начала
  var currentId = null;
  var sessionFilter = 'all';
  var lastWinsKey = '';       // чтобы подсветить новые записи журнала выигрышей
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  var MONTHS_FULL = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var PRIZE_ICONS = ['🏆', '🎫', '✨', '🎁', '🎖️', '🎴'];

  var $ = function (id) { return document.getElementById(id); };

  // ── Маленький помощник для DOM: h('div', { className: 'x' }, ['текст', h(...)]) ──
  function h(tag, props, children) {
    var el = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) {
      if (k === 'text') el.textContent = props[k];
      else if (k === 'attrs') Object.keys(props.attrs).forEach(function (a) { el.setAttribute(a, props.attrs[a]); });
      else el[k] = props[k];
    });
    (children || []).forEach(function (c) {
      if (c == null || c === false) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  // ── Даты и время ──
  // Время в данных записано «как на месте события» (2026-11-07T14:30) + смещение пояса события (+09:00).
  // Строки с явным поясом (Z, +03:00) и Timestamp из Firestore тоже понимаем.
  function tzMinutes(tz) {
    var m = /^([+-])(\d\d):?(\d\d)$/.exec(tz || '+03:00');
    return m ? (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10)) : 180;
  }
  function toDate(value, tz, endOfDay) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === 'function') return value.toDate();
    var s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += endOfDay ? 'T23:59:59' : 'T00:00:00';
    else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) s += ':00';
    if (!/(Z|[+-]\d\d:?\d\d)$/.test(s)) s += (tz || '+03:00');
    var d = new Date(s);
    return isNaN(d) ? null : d;
  }
  // Части даты в поясе события (для подписей «7 ноября, 14:30» независимо от пояса посетителя)
  function parts(date, tz) {
    var t = new Date(date.getTime() + tzMinutes(tz) * 60000);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), hh: t.getUTCHours(), mm: t.getUTCMinutes() };
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtTime(date, tz) { var p = parts(date, tz); return pad(p.hh) + ':' + pad(p.mm); }
  function fmtDay(date, tz) { var p = parts(date, tz); return p.d + ' ' + MONTHS_FULL[p.m]; }
  function fmtRange(ev) {
    var a = toDate(ev.start, ev.tz), b = toDate(ev.end || ev.start, ev.tz);
    if (!a) return '';
    var pa = parts(a, ev.tz), pb = parts(b || a, ev.tz);
    if (pa.y === pb.y && pa.m === pb.m && pa.d === pb.d) return pa.d + ' ' + MONTHS_FULL[pa.m] + ' ' + pa.y;
    if (pa.y === pb.y && pa.m === pb.m) return pa.d + '–' + pb.d + ' ' + MONTHS_FULL[pa.m] + ' ' + pa.y;
    return pa.d + ' ' + MONTHS_FULL[pa.m] + ' – ' + pb.d + ' ' + MONTHS_FULL[pb.m] + ' ' + pb.y;
  }
  function plural(n, one, few, many) {
    var n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
    return many;
  }
  function untilText(ms) {
    var min = Math.max(1, Math.round(ms / 60000));
    if (min < 60) return min + ' мин';
    var hrs = Math.floor(min / 60);
    if (hrs < 24) return hrs + ' ' + plural(hrs, 'час', 'часа', 'часов') + (min % 60 ? ' ' + (min % 60) + ' мин' : '');
    var days = Math.floor(hrs / 24), rest = hrs % 24;
    return days + ' ' + plural(days, 'день', 'дня', 'дней') + (rest ? ' ' + rest + ' ч' : '');
  }

  // «вчера», «5 дней назад», «2 месяца назад» — для прошедших событий часы не важны
  function agoText(ms) {
    var days = Math.floor(ms / 86400000);
    if (days < 1) return 'сегодня';
    if (days < 2) return 'вчера';
    if (days < 60) return days + ' ' + plural(days, 'день', 'дня', 'дней') + ' назад';
    var months = Math.round(days / 30);
    return months + ' ' + plural(months, 'месяц', 'месяца', 'месяцев') + ' назад';
  }

  // ── Статусы ──
  function eventState(ev, now) {
    var a = toDate(ev.start, ev.tz), b = toDate(ev.end || ev.start, ev.tz, true);
    if (!a) return { key: 'upcoming', label: 'Дата уточняется' };
    if (now < a) return { key: 'upcoming', label: 'Скоро', ms: a - now };
    if (b && now <= b) return { key: 'live', label: 'Идёт сейчас' };
    return { key: 'past', label: 'Завершён', ms: now - (b || a) };
  }
  function sessionState(s, ev, now) {
    var manual = String(s.status || '').toLowerCase();
    if (manual.indexOf('отмен') === 0) return { key: 'cancelled', label: 'Отменён' };
    if (manual.indexOf('перен') === 0) return { key: 'moved', label: 'Перенесён' };
    var a = toDate(s.start, ev.tz);
    var b = toDate(s.end, ev.tz) || (a && new Date(a.getTime() + 60 * 60000));
    if (!a) return { key: 'upcoming', label: 'Время уточняется' };
    if (now < a) {
      var left = a - now;
      return { key: 'upcoming', label: left < 24 * 3600000 ? 'Через ' + untilText(left) : 'Скоро' };
    }
    if (now <= b) return { key: 'live', label: 'Идёт сейчас' };
    return { key: 'past', label: 'Завершён' };
  }
  function statusChip(st) {
    return h('span', { className: 'status status-' + st.key, text: (st.key === 'live' ? '● ' : '') + st.label });
  }

  // ── Данные: справочник + Firestore ──
  function list(v) { return Array.isArray(v) ? v : []; }
  function normalizeEvent(raw, id) {
    var ev = Object.assign({}, raw);
    ev.id = String(id || raw.id || '').trim();
    ev.title = String(ev.title || 'Событие без названия');
    ev.tz = ev.tz || '+03:00';
    ev.tzLabel = ev.tzLabel || '';
    ev.intro = Array.isArray(ev.intro) ? ev.intro : (ev.intro ? [String(ev.intro)] : []);
    ['zones', 'timeline', 'gallery', 'prizes', 'wins', 'sessions', 'upcoming'].forEach(function (k) { ev[k] = list(ev[k]); });
    ev.rules = ev.rules && typeof ev.rules === 'object' ? ev.rules : {};
    return ev;
  }
  // Старые имена полей из первой версии страницы → текущие (если указаны оба — побеждает текущее).
  // Полная схема и проверка данных: node tools/festivals-seed.mjs check
  function applyAliases(raw) {
    var d = Object.assign({}, raw || {});
    if (d.upcoming === undefined && d.upcomingReleases !== undefined) d.upcoming = d.upcomingReleases;
    if (d.intro === undefined && d.whatHappened !== undefined) d.intro = d.whatHappened;
    if (d.tagline === undefined && d.subtitle !== undefined) d.tagline = d.subtitle;
    var pr = d.prizesAndRules;
    if (pr && typeof pr === 'object') {
      if (d.prizes === undefined && pr.prizes !== undefined) d.prizes = pr.prizes;
      if (d.wins === undefined && pr.wins !== undefined) d.wins = pr.wins;
      if (d.rules === undefined && (pr.howItWorks !== undefined || pr.steps !== undefined)) {
        d.rules = { howItWorks: pr.howItWorks, steps: pr.steps };
      }
    }
    return d;
  }

  function rebuild() {
    var byId = {};
    LOCAL.forEach(function (e) { if (e && e.id) byId[e.id] = normalizeEvent(e, e.id); });
    Object.keys(remote).forEach(function (id) {
      // документ Firestore дополняет/заменяет поля события из справочника
      byId[id] = normalizeEvent(Object.assign({}, byId[id] || {}, applyAliases(remote[id])), id);
    });
    events = Object.keys(byId).map(function (id) { return byId[id]; })
      .filter(function (e) { return e.id && !e.hidden; })
      .sort(function (a, b) { return (toDate(a.start, a.tz) || 0) - (toDate(b.start, b.tz) || 0); });
  }
  function findEvent(id) { return events.filter(function (e) { return e.id === id; })[0] || null; }

  // Событие по умолчанию: идущее сейчас → ближайшее будущее → последнее прошедшее
  function defaultEvent() {
    var now = new Date();
    var live = events.filter(function (e) { return eventState(e, now).key === 'live'; })[0];
    if (live) return live;
    var next = events.filter(function (e) { return eventState(e, now).key === 'upcoming'; })[0];
    return next || events[events.length - 1] || null;
  }

  // ── Отрисовка: выбор, календарь ──
  function renderPicker() {
    var sel = $('festivalSelect');
    var now = new Date();
    sel.replaceChildren();
    events.forEach(function (ev) {
      var st = eventState(ev, now);
      var mark = st.key === 'live' ? ' · идёт сейчас' : st.key === 'past' ? ' · завершён' : '';
      sel.appendChild(h('option', { value: ev.id, text: ev.title + ' — ' + fmtRange(ev) + mark }));
    });
    if (currentId) sel.value = currentId;
  }

  function renderCalendar() {
    var box = $('calendarList');
    var now = new Date();
    box.replaceChildren();
    events.forEach(function (ev) {
      var a = toDate(ev.start, ev.tz);
      var p = a ? parts(a, ev.tz) : null;
      var st = eventState(ev, now);
      var btn = h('button', {
        type: 'button',
        className: 'cal-card',
        attrs: { 'aria-current': String(ev.id === currentId), 'data-id': ev.id, 'aria-label': ev.title + ', ' + fmtRange(ev) + ', ' + st.label }
      }, [
        h('span', { className: 'cal-date', attrs: { 'aria-hidden': 'true' } }, [
          h('span', { className: 'cal-day', text: p ? String(p.d) : '?' }),
          h('span', { className: 'cal-month', text: p ? MONTHS[p.m] : '' })
        ]),
        h('span', { className: 'cal-info' }, [
          h('span', { className: 'cal-title', text: ev.title }),
          h('span', { className: 'cal-sub' }, [fmtRange(ev) + ' · ' + (ev.city || '') + ' ', statusChip(st)])
        ])
      ]);
      btn.addEventListener('click', function () { selectEvent(ev.id, { push: true, scroll: true }); });
      box.appendChild(h('li', null, [btn]));
    });
  }

  // ── Отрисовка события ──
  function renderHero(ev, now) {
    $('heroKind').textContent = ev.kind || 'Событие';
    $('heroTitle').textContent = ev.title;
    $('heroTagline').textContent = ev.tagline || '';
    var meta = $('heroMeta');
    meta.replaceChildren(
      h('li', null, ['🗓️ ', fmtRange(ev)]),
      ev.city ? h('li', null, ['📍 ', ev.city + (ev.venue ? ', ' + ev.venue : '')]) : null,
      ev.tzLabel ? h('li', null, ['🕒 Время ', ev.tzLabel]) : null
    );
    var st = eventState(ev, now);
    var label = st.key === 'upcoming' ? 'До начала' : st.key === 'live' ? 'Статус' : 'Событие';
    var value = st.key === 'upcoming' ? (st.ms ? untilText(st.ms) : 'скоро')
      : st.key === 'live' ? '● Идёт сейчас'
      : 'Завершён ' + agoText(st.ms);
    $('heroStatus').replaceChildren(
      h('span', { className: 'hero-status-label', text: label }),
      h('span', { className: 'hero-status-value' + (st.key === 'live' ? ' is-live' : ''), text: value })
    );
  }

  function renderStory(ev, now) {
    var intro = $('storyIntro');
    intro.replaceChildren();
    if (ev.intro.length) ev.intro.forEach(function (p) { intro.appendChild(h('p', { text: String(p) })); });
    else intro.appendChild(h('p', { className: 'muted-note', text: 'Рассказ о событии скоро появится.' }));

    var zones = $('zonesList');
    zones.replaceChildren();
    ev.zones.forEach(function (z) {
      zones.appendChild(h('div', { className: 'zone' }, [
        h('span', { className: 'zone-icon', text: z.icon || '✦', attrs: { 'aria-hidden': 'true' } }),
        h('span', { className: 'zone-title', text: z.title || '' }),
        h('p', { className: 'zone-text', text: z.text || '' })
      ]));
    });
    if (!ev.zones.length) zones.appendChild(h('p', { className: 'muted-note', text: 'Схема площадки появится ближе к событию.' }));

    var tl = $('timelineList');
    tl.replaceChildren();
    ev.timeline.slice().sort(function (a, b) { return (toDate(a.at, ev.tz) || 0) - (toDate(b.at, ev.tz) || 0); })
      .forEach(function (t, i, arr) {
        var at = toDate(t.at, ev.tz);
        var next = arr[i + 1] && toDate(arr[i + 1].at, ev.tz);
        var cls = 'tl-item';
        if (at && now >= at) cls += next && now < next ? ' is-now' : (next || now - at > 3 * 3600000 ? ' is-done' : ' is-now');
        tl.appendChild(h('li', { className: cls }, [
          h('span', { className: 'tl-time', text: at ? fmtDay(at, ev.tz) + ', ' + fmtTime(at, ev.tz) : '' }),
          h('span', { className: 'tl-title', text: t.title || '' }),
          t.text ? h('p', { className: 'tl-text', text: t.text }) : null
        ]));
      });
    if (!ev.timeline.length) tl.appendChild(h('li', { className: 'muted-note', text: 'Хронология появится во время события.' }));
  }

  // Разрешаем картинки только с сайта (../img/…, img/…) и по https
  function safeSrc(src) {
    var s = String(src || '').trim();
    return /^(https:\/\/|\.\.\/img\/|img\/|\/img\/)/i.test(s) ? s : '';
  }

  function renderGallery(ev, now) {
    var box = $('galleryList');
    box.replaceChildren();
    if (!ev.gallery.length) {
      var past = eventState(ev, now).key === 'past';
      box.appendChild(h('div', { className: 'empty-state' }, [
        h('strong', { text: past ? 'Фотографии ещё разбираем' : 'Фото появятся во время события' }),
        past ? 'Скоро здесь будут лучшие кадры — загляните чуть позже.' : 'Мы будем добавлять кадры прямо с площадки — страница обновится сама.'
      ]));
      return;
    }
    ev.gallery.forEach(function (ph) {
      var src = safeSrc(ph.src);
      var caption = ph.caption || '';
      var visual;
      if (src) {
        var img = h('img', { src: src, alt: caption || ev.title, loading: 'lazy', decoding: 'async' });
        visual = h('button', { type: 'button', className: 'photo-btn', attrs: { 'aria-label': 'Открыть фото: ' + (caption || ev.title) } }, [img]);
        visual.addEventListener('click', function () { openPhoto(src, caption, ph.tag); });
        // битая ссылка — показываем заглушку вместо пустого места
        img.addEventListener('error', function () {
          visual.replaceWith(h('div', { className: 'photo-empty' }, [h('span', { text: '📷', attrs: { 'aria-hidden': 'true' } }), h('span', { text: 'Фото недоступно' })]));
        }, { once: true });
      } else {
        visual = h('div', { className: 'photo-empty' }, [
          h('span', { text: '📷', attrs: { 'aria-hidden': 'true' } }),
          h('span', { text: 'Кадр скоро появится' })
        ]);
      }
      box.appendChild(h('figure', { className: 'photo' }, [
        visual,
        h('figcaption', null, [ph.tag ? h('span', { className: 'photo-tag', text: ph.tag }) : null, ph.tag ? h('br') : null, caption])
      ]));
    });
  }

  function renderPrizes(ev, now) {
    var rules = ev.rules || {};
    $('rulesText').textContent = rules.howItWorks || 'Правила участия опубликуем ближе к событию.';
    var steps = $('rulesSteps');
    steps.replaceChildren();
    list(rules.steps).forEach(function (s) { steps.appendChild(h('li', { text: String(s) })); });
    steps.hidden = !list(rules.steps).length;

    var prizes = $('prizesList');
    prizes.replaceChildren();
    ev.prizes.forEach(function (p, i) {
      prizes.appendChild(h('li', { className: 'prize' }, [
        h('span', { className: 'prize-icon', text: PRIZE_ICONS[i % PRIZE_ICONS.length], attrs: { 'aria-hidden': 'true' } }),
        h('span', null, [h('span', { className: 'prize-title', text: p.title || '' }), p.desc ? h('p', { className: 'prize-desc', text: p.desc }) : null]),
        p.qty ? h('span', { className: 'prize-qty', text: p.qty }) : null
      ]));
    });
    if (!ev.prizes.length) prizes.appendChild(h('li', { className: 'muted-note', text: 'Список призов уточняется.' }));

    // Журнал выигрышей: новые сверху; новые записи из Firebase на секунду подсвечиваются
    var wins = $('winsList');
    var sorted = ev.wins.slice().sort(function (a, b) { return (toDate(b.at, ev.tz) || 0) - (toDate(a.at, ev.tz) || 0); });
    var key = ev.id + ':' + sorted.length;
    var fresh = lastWinsKey && lastWinsKey.split(':')[0] === ev.id && lastWinsKey !== key;
    var prevCount = fresh ? parseInt(lastWinsKey.split(':')[1], 10) : sorted.length;
    lastWinsKey = key;
    wins.replaceChildren();
    sorted.forEach(function (w, i) {
      var at = toDate(w.at, ev.tz);
      wins.appendChild(h('li', { className: 'win' + (fresh && i < sorted.length - prevCount ? ' is-new' : '') }, [
        h('span', { className: 'win-time', text: at ? fmtDay(at, ev.tz) + ', ' + fmtTime(at, ev.tz) : '' }),
        h('span', { className: 'win-line' }, [h('strong', { text: w.who || 'Участник' }), ' — ' + (w.prize || 'приз')]),
        w.how ? h('span', { className: 'win-how', text: w.how }) : null
      ]));
    });
    if (!sorted.length) {
      var st = eventState(ev, now).key;
      wins.appendChild(h('li', { className: 'muted-note', text: st === 'past'
        ? 'Итоги розыгрышей ещё публикуются.'
        : 'Розыгрыши впереди — журнал будет заполняться в реальном времени.' }));
    }
  }

  function renderSessions(ev, now) {
    $('tzNote').textContent = ev.tzLabel ? 'Время указано ' + ev.tzLabel + '.' : '';
    var box = $('sessionsList');
    box.replaceChildren();
    var shown = 0;
    ev.sessions.slice().sort(function (a, b) { return (toDate(a.start, ev.tz) || 0) - (toDate(b.start, ev.tz) || 0); })
      .forEach(function (s) {
        var st = sessionState(s, ev, now);
        var isPast = st.key === 'past' || st.key === 'cancelled';
        if (sessionFilter === 'upcoming' && isPast) return;
        if (sessionFilter === 'past' && !isPast) return;
        shown++;
        var a = toDate(s.start, ev.tz), b = toDate(s.end, ev.tz);
        box.appendChild(h('li', { className: 'session' + (st.key === 'live' ? ' is-live' : '') + (isPast ? ' is-past' : '') }, [
          h('span', { className: 'session-when' }, [
            h('span', { className: 'session-date', text: a ? fmtDay(a, ev.tz) : '' }),
            h('span', { className: 'session-time', text: a ? fmtTime(a, ev.tz) : '—' }),
            b ? h('span', { className: 'session-end', text: 'до ' + fmtTime(b, ev.tz) }) : null
          ]),
          h('span', null, [
            h('span', { className: 'session-title', text: s.title || '' }),
            s.place ? h('span', { className: 'session-place', text: '📍 ' + s.place }) : null,
            s.desc ? h('p', { className: 'session-desc', text: s.desc }) : null,
            statusChip(st)
          ])
        ]));
      });
    if (!shown) box.appendChild(h('li', { className: 'muted-note', text: ev.sessions.length
      ? (sessionFilter === 'upcoming' ? 'Все сеансы уже прошли.' : 'Прошедших сеансов пока нет.')
      : 'Расписание сеансов скоро появится.' }));
  }

  function renderUpcoming(ev, now) {
    var box = $('upcomingList');
    box.replaceChildren();
    ev.upcoming.slice().sort(function (a, b) { return (toDate(a.date, ev.tz) || 0) - (toDate(b.date, ev.tz) || 0); })
      .forEach(function (u) {
        var d = toDate(u.date, ev.tz);
        var dEnd = toDate(u.date, ev.tz, true);
        var left = !d ? '' : now > dEnd ? 'уже вышло' : now >= d ? 'сегодня' : 'через ' + untilText(d - now);
        var title = u.link && /^(news|content|movies|favorites)\.html(\?[\w=&%-]*)?$|^\.\.\/index\.html$|^https:\/\//.test(u.link)
          ? h('a', { href: u.link, text: u.title || '' })
          : document.createTextNode(u.title || '');
        // ссылка на другое событие этой же страницы — переключаем без перезагрузки
        if (title.tagName === 'A' && /^news\.html\?id=/.test(u.link)) {
          title.addEventListener('click', function (e) {
            var id = new URLSearchParams(u.link.split('?')[1]).get('id');
            if (findEvent(id)) { e.preventDefault(); selectEvent(id, { push: true, scroll: true }); }
          });
        }
        box.appendChild(h('li', { className: 'up-item' }, [
          h('span', { className: 'up-date' }, [
            h('span', { className: 'up-day', text: d ? fmtDay(d, ev.tz) : 'Дата уточняется' }),
            left ? h('span', { className: 'up-left', text: left }) : null
          ]),
          h('span', null, [h('span', { className: 'up-title' }, [title]), u.desc ? h('p', { className: 'up-desc', text: u.desc }) : null])
        ]));
      });
    if (!ev.upcoming.length) box.appendChild(h('li', { className: 'muted-note', text: 'Анонсы следующих выходов скоро появятся.' }));
  }

  function renderEvent() {
    var ev = findEvent(currentId);
    if (!ev) return;
    var now = new Date();
    document.title = ev.title + ' — Фестивали и премьеры — Anime Fan Club';
    renderHero(ev, now);
    renderStory(ev, now);
    renderGallery(ev, now);
    renderPrizes(ev, now);
    renderSessions(ev, now);
    renderUpcoming(ev, now);
  }

  function renderAll() {
    renderPicker();
    renderCalendar();
    renderEvent();
  }

  // ── Выбор события и адрес страницы ──
  function idFromUrl() { return new URLSearchParams(location.search).get('id'); }

  function selectEvent(id, opts) {
    opts = opts || {};
    var ev = findEvent(id);
    if (!ev) return;
    var changed = ev.id !== currentId;
    currentId = ev.id;
    $('pickerNotice').hidden = true;
    if (opts.push && idFromUrl() !== ev.id) {
      history.pushState({ festival: ev.id }, '', '?id=' + encodeURIComponent(ev.id));
    }
    if (changed) { sessionFilter = 'all'; syncChips(); lastWinsKey = ''; }
    renderAll();
    if (opts.scroll) {
      $('eventHero').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }
  }

  // Открыть событие из адреса: неизвестный id — показываем ближайшее и честно об этом пишем
  function openFromUrl() {
    var id = idFromUrl();
    var ev = id && findEvent(id);
    if (ev) { currentId = ev.id; renderAll(); return; }
    var def = defaultEvent();
    if (!def) return;
    currentId = def.id;
    renderAll();
    if (id) {
      var note = $('pickerNotice');
      note.textContent = 'Событие «' + id + '» не найдено — показываем «' + def.title + '». Выберите другое в списке.';
      note.hidden = false;
      history.replaceState({ festival: def.id }, '', '?id=' + encodeURIComponent(def.id));
    }
  }

  function syncChips() {
    document.querySelectorAll('.chip').forEach(function (c) {
      c.setAttribute('aria-pressed', String(c.dataset.filter === sessionFilter));
    });
  }

  // ── Просмотр фото ──
  function openPhoto(src, caption, tag) {
    var dlg = $('photoView');
    $('photoViewImg').src = src;
    $('photoViewImg').alt = caption || '';
    $('photoViewCaption').textContent = (tag ? tag + ' · ' : '') + (caption || '');
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }

  // ── Статус подключения ──
  function setLive(state, text) {
    var badge = $('liveStatus');
    badge.dataset.state = state;
    badge.querySelector('.live-text').textContent = text;
  }

  // ── Firestore в реальном времени ──
  function connectLive() {
    var fb = window.firebase;
    if (!fb || typeof fb.firestore !== 'function' || !window.ANIME_FIREBASE_CONFIG) {
      setLive('offline', 'Справочник сайта');
      return;
    }
    var gotAnswer = false;
    // нет ответа от Firestore за 10 секунд (нет сети) — честно показываем, что работаем на справочнике
    var timer = setTimeout(function () { if (!gotAnswer) setLive('offline', 'Нет связи · справочник'); }, 10000);
    try {
      var app = fb.apps && fb.apps.length ? fb.app() : fb.initializeApp(window.ANIME_FIREBASE_CONFIG);
      fb.firestore(app).collection('festivals').onSnapshot(function (snap) {
        gotAnswer = true;
        clearTimeout(timer);
        var next = {};
        snap.forEach(function (doc) { next[doc.id] = doc.data(); });
        remote = next;
        rebuild();
        // если открытое событие удалили из базы и его нет в справочнике — переходим к ближайшему
        if (!findEvent(currentId)) { var d = defaultEvent(); currentId = d ? d.id : null; }
        // календарь с фокусом не перестраиваем, чтобы клавиатура не теряла позицию
        var active = document.activeElement;
        renderEvent();
        if (active !== $('festivalSelect')) renderPicker();
        if (!$('calendarList').contains(active)) renderCalendar();
        var t = new Date();
        if (snap.metadata && snap.metadata.fromCache) setLive('offline', 'Нет связи · сохранённые данные');
        else if (snap.empty) setLive('live', 'Онлайн · справочник сайта');
        else setLive('live', 'В эфире · обновлено ' + pad(t.getHours()) + ':' + pad(t.getMinutes()));
      }, function (err) {
        // нет прав на чтение, Firestore выключен и т. п. — без ошибок остаёмся на справочнике
        gotAnswer = true;
        clearTimeout(timer);
        console.warn('Фестивали: живые обновления недоступны (' + (err && err.code || err) + '), показываем справочник сайта.');
        setLive('offline', 'Справочник сайта');
      });
    } catch (e) {
      clearTimeout(timer);
      console.warn('Фестивали: Firebase не запустился, показываем справочник сайта.', e && e.message);
      setLive('offline', 'Справочник сайта');
    }
  }

  // ── Запуск ──
  function init() {
    rebuild();
    if (!events.length) {
      $('heroTitle').textContent = 'Скоро здесь появятся фестивали';
      setLive('offline', 'Нет данных');
      return;
    }
    openFromUrl();

    $('festivalSelect').addEventListener('change', function (e) { selectEvent(e.target.value, { push: true }); });
    window.addEventListener('popstate', function () {
      var ev = findEvent(idFromUrl()) || defaultEvent();
      if (ev) { currentId = ev.id; sessionFilter = 'all'; syncChips(); renderAll(); }
    });
    document.querySelectorAll('.chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        sessionFilter = chip.dataset.filter;
        syncChips();
        var ev = findEvent(currentId);
        if (ev) renderSessions(ev, new Date());
      });
    });

    var dlg = $('photoView');
    $('photoViewClose').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });

    // Статусы («через 20 мин», «идёт сейчас») и обратный отсчёт обновляются раз в минуту.
    // Галерею не трогаем, а календарь и список — только если в них нет фокуса (не сбиваем выбор).
    function tick() {
      if (document.hidden) return;
      var ev = findEvent(currentId);
      if (!ev) return;
      var now = new Date();
      renderHero(ev, now);
      renderStory(ev, now);
      renderSessions(ev, now);
      renderUpcoming(ev, now);
      var active = document.activeElement;
      if (active !== $('festivalSelect')) renderPicker();
      if (!$('calendarList').contains(active)) renderCalendar();
    }
    setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);

    connectLive();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
