/* Раздел «График выхода аниме» на pages/news.html.
 *
 * Данные — data/schedule.json (собирает tools/build-schedule.mjs из AniList):
 *   ongoing   — онгоинги: следующая серия (nextEpisode) и время выхода (airingAt, unix-секунды);
 *   premieres — премьеры новых тайтлов; sequels — новые сезоны и продолжения.
 * Время следующих серий онгоингов страница уточняет прямо в AniList (если сеть доступна);
 * без сети — считает по данным файла: если серия уже вышла, следующая — через неделю (помечается «≈»).
 * Таймеры обратного отсчёта обновляются каждые 30 секунд. Все тексты выводятся через textContent.
 */
(function () {
  'use strict';

  var root = document.getElementById('schedule');
  if (!root) return;

  var DATA_URL = '../data/schedule.json';
  var PAGE = 24;
  var WEEK = 7 * 24 * 3600;
  var FORMAT = { TV: 'ТВ-сериал', TV_SHORT: 'Короткий ТВ', ONA: 'ONA', OVA: 'OVA', MOVIE: 'Фильм', SPECIAL: 'Спешл', MUSIC: 'Клип' };
  var SEASON = { WINTER: 'Зима', SPRING: 'Весна', SUMMER: 'Лето', FALL: 'Осень' };
  var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  var DAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

  var listEl = document.getElementById('schedList');
  var searchEl = document.getElementById('schedSearch');
  var daysEl = document.getElementById('schedDays');
  var noteEl = document.getElementById('schedNote');
  var sourceEl = document.getElementById('schedSource');
  var moreBox = document.getElementById('schedMore');
  var moreBtn = document.getElementById('schedMoreBtn');
  var tabs = Array.prototype.slice.call(root.querySelectorAll('.sched-tab'));

  var data = null;
  var state = { tab: 'ongoing', day: 'all', shown: PAGE };
  var countdowns = [];

  var normalize = function (t) { return String(t || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // ── время ──
  function fmtDateTime(ts) {
    var d = new Date(ts * 1000);
    return DAYS[d.getDay()].toLowerCase() + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '') + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function fmtStart(it) {
    var s = it.startDate;
    if (s && s.year && s.month && s.day) return s.day + ' ' + MONTHS[s.month - 1] + ' ' + s.year;
    if (s && s.year && s.month) return MONTHS_NOM[s.month - 1] + ' ' + s.year;
    if (it.season && it.seasonYear) return SEASON[it.season] + ' ' + it.seasonYear;
    if (s && s.year) return s.year + ' год';
    return 'дата пока не объявлена';
  }
  function countdownText(ts) {
    var left = ts - Date.now() / 1000;
    if (left <= 0) return left > -3600 ? 'выходит сейчас' : 'уже вышла';
    var d = Math.floor(left / 86400), h = Math.floor(left % 86400 / 3600), m = Math.floor(left % 3600 / 60);
    if (d > 0) return 'через ' + d + ' дн. ' + h + ' ч.';
    if (h > 0) return 'через ' + h + ' ч. ' + m + ' мин.';
    return 'через ' + Math.max(1, m) + ' мин.';
  }
  // дата старта премьеры/сезона в секундах (точная — по airingAt, иначе по дню без времени)
  function startTs(it) {
    if (it.airingAt) return it.airingAt;
    var s = it.startDate;
    return s && s.year && s.month && s.day ? new Date(s.year, s.month - 1, s.day).getTime() / 1000 : null;
  }

  // Онгоинг, чья серия уже вышла, а свежих данных нет: следующая — через неделю
  function rollForward(it) {
    if (!it.airingAt) return;
    var now = Date.now() / 1000;
    while (it.airingAt < now - 3600) {
      if (it.episodes && it.nextEpisode >= it.episodes) { it.finished = true; break; }
      it.airingAt += WEEK;
      it.nextEpisode += 1;
      it.estimated = true;
    }
  }

  // ── карточка ──
  function card(it, kind) {
    var li = el('li', 'sched-card');
    var poster = el('div', 'sched-poster');
    if (it.poster) {
      var img = el('img');
      img.src = it.poster;
      img.alt = 'Постер: ' + it.title;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('error', function () { img.src = '../img/poster-placeholder.svg'; img.alt = ''; }, { once: true });
      poster.appendChild(img);
    }
    var body = el('div', 'sched-body');

    // Название: тайтл есть в каталоге → страница содержания; иначе — карточка на AniList
    var h = el('h3', 'sched-title');
    var a = el('a', null, it.title);
    if (it.catalogId) a.href = 'content.html?anime=' + encodeURIComponent(it.catalogId);
    else if (it.url) { a.href = it.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = 'Открыть на AniList'; }
    h.appendChild(a);
    body.appendChild(h);

    var orig = [it.titleEnglish, it.titleOriginal].filter(function (t, i, arr) { return t && t !== it.title && arr.indexOf(t) === i; }).join(' · ');
    if (orig) body.appendChild(el('div', 'sched-orig', orig));
    if (it.franchise) body.appendChild(el('div', 'sched-franchise', 'Франшиза: ' + it.franchise));
    if (kind === 'sequels' && it.prequel && it.prequel.title) body.appendChild(el('div', 'sched-franchise', 'Продолжение «' + it.prequel.title + '»'));

    var tags = el('div', 'sched-tags');
    if (kind === 'sequels' && it.sequel) {
      var s = it.sequel;
      var label = s.season ? s.season + ' сезон' + (s.part ? ', часть ' + s.part : '') : s.part ? 'Часть ' + s.part : s.final ? 'Финальный сезон' : '';
      if (label) tags.appendChild(el('span', 'sched-tag is-hot', label));
    }
    if (it.catalogId) tags.appendChild(el('span', 'sched-tag', 'В каталоге'));
    if (FORMAT[it.format]) tags.appendChild(el('span', 'sched-tag', FORMAT[it.format]));
    if (it.studio) tags.appendChild(el('span', 'sched-tag', it.studio));
    (it.genres || []).slice(0, 3).forEach(function (g) { tags.appendChild(el('span', 'sched-tag', g)); });
    body.appendChild(tags);

    var when = el('div', 'sched-when');
    var cd = null;
    if (kind === 'ongoing') {
      if (it.finished) {
        when.appendChild(el('span', 'sched-ep', 'Сезон завершается'));
      } else {
        when.appendChild(el('span', 'sched-ep', 'Серия ' + it.nextEpisode + (it.episodes ? ' из ' + it.episodes : '')));
        when.appendChild(el('span', 'sched-date', fmtDateTime(it.airingAt)));
        cd = el('span', 'sched-countdown' + (it.estimated ? ' is-estimate' : ''));
        cd.dataset.ts = it.airingAt;
      }
    } else {
      when.appendChild(el('span', 'sched-ep', kind === 'premieres' ? 'Премьера' : 'Выход'));
      when.appendChild(el('span', 'sched-date', it.airingAt ? fmtDateTime(it.airingAt) : fmtStart(it)));
      var ts = startTs(it);
      if (ts && ts > Date.now() / 1000) { cd = el('span', 'sched-countdown'); cd.dataset.ts = ts; }
    }
    if (cd) { when.appendChild(cd); countdowns.push(cd); }
    body.appendChild(when);

    if (it.synopsis) body.appendChild(el('p', 'sched-desc', it.synopsis));

    var soon = cd && Number(cd.dataset.ts) - Date.now() / 1000 < 86400;
    if (soon) li.classList.add('is-soon');
    li.append(poster, body);
    return li;
  }

  function tickCountdowns() {
    countdowns = countdowns.filter(function (c) { return c.isConnected; });
    countdowns.forEach(function (c) { c.textContent = countdownText(Number(c.dataset.ts)); });
  }

  // ── вывод ──
  function currentList() {
    if (!data) return [];
    var list = data[state.tab] || [];
    var q = normalize(searchEl.value);
    if (q) list = list.filter(function (it) {
      return normalize([it.title, it.titleEnglish, it.titleOriginal, it.franchise, it.prequel && it.prequel.title].join(' | ')).indexOf(q) !== -1;
    });
    if (state.tab === 'ongoing') {
      if (state.day !== 'all') list = list.filter(function (it) { return it.airingAt && new Date(it.airingAt * 1000).getDay() === Number(state.day); });
      list = list.slice().sort(function (a, b) { return (a.finished ? 1 : 0) - (b.finished ? 1 : 0) || a.airingAt - b.airingAt; });
    }
    return list;
  }

  function render() {
    var list = currentList();
    countdowns = [];
    listEl.replaceChildren();
    if (!list.length) {
      listEl.appendChild(el('li', 'sched-empty', data ? 'Ничего не найдено' : 'Загружаем расписание…'));
    } else {
      var frag = document.createDocumentFragment();
      list.slice(0, state.shown).forEach(function (it) { frag.appendChild(card(it, state.tab)); });
      listEl.appendChild(frag);
    }
    var left = list.length - state.shown;
    moreBox.hidden = left <= 0;
    moreBtn.textContent = 'Показать ещё ' + Math.min(PAGE, Math.max(left, 0));
    daysEl.hidden = state.tab !== 'ongoing';
    noteEl.textContent = state.tab === 'ongoing'
      ? 'Время выхода серий — по вашему часовому поясу. Онгоинги отсортированы по ближайшей серии.'
      : state.tab === 'premieres'
        ? 'Новые тайтлы (не продолжения), которые стартуют в ближайших сезонах. Точная дата — если она уже объявлена.'
        : 'Новые сезоны и продолжения известных аниме.';
    tickCountdowns();
  }

  function setTab(tab) {
    state.tab = tab;
    state.shown = PAGE;
    tabs.forEach(function (t) {
      var on = t.dataset.tab === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    render();
  }

  function buildDays() {
    var today = new Date().getDay();
    var order = [1, 2, 3, 4, 5, 6, 0];
    var all = el('button', 'sched-day', 'Все');
    all.type = 'button';
    all.dataset.day = 'all';
    all.setAttribute('aria-pressed', 'true');
    daysEl.appendChild(all);
    order.forEach(function (d) {
      var b = el('button', 'sched-day' + (d === today ? ' is-today' : ''), DAYS[d]);
      b.type = 'button';
      b.dataset.day = String(d);
      b.setAttribute('aria-pressed', 'false');
      if (d === today) b.title = 'Сегодня';
      daysEl.appendChild(b);
    });
    daysEl.addEventListener('click', function (e) {
      var b = e.target.closest('.sched-day');
      if (!b) return;
      state.day = b.dataset.day;
      state.shown = PAGE;
      daysEl.querySelectorAll('.sched-day').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      render();
    });
  }

  function updateCounts() {
    tabs.forEach(function (t) {
      var c = t.querySelector('.sched-count');
      if (c) c.textContent = data && data[t.dataset.tab] ? data[t.dataset.tab].length : '';
    });
  }

  function setSource(live) {
    var d = data && data.generatedAt ? new Date(data.generatedAt) : null;
    sourceEl.dataset.live = live ? '1' : '';
    sourceEl.textContent = live
      ? 'Время серий обновлено из AniList только что'
      : d ? 'Данные AniList от ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() : '';
  }

  // Свежее время следующих серий онгоингов прямо из AniList; при ошибке остаются данные файла
  function refreshLive() {
    var ids = data.ongoing.map(function (it) { return it.anilistId; });
    if (!ids.length || !window.fetch) return;
    var query = 'query($ids:[Int],$page:Int){Page(page:$page,perPage:50){pageInfo{hasNextPage}media(id_in:$ids){id status episodes nextAiringEpisode{airingAt episode}}}}';
    var fresh = {};
    function load(page) {
      return fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: query, variables: { ids: ids, page: page } })
      }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (body) {
          body.data.Page.media.forEach(function (m) { fresh[m.id] = m; });
          return body.data.Page.pageInfo.hasNextPage && page < 3 ? load(page + 1) : null;
        });
    }
    load(1).then(function () {
      data.ongoing.forEach(function (it) {
        var m = fresh[it.anilistId];
        if (!m) return;
        if (m.nextAiringEpisode) {
          it.airingAt = m.nextAiringEpisode.airingAt;
          it.nextEpisode = m.nextAiringEpisode.episode;
          it.estimated = false;
          it.finished = false;
        } else if (m.status === 'FINISHED') {
          it.finished = true;
        }
        if (m.episodes) it.episodes = m.episodes;
      });
      setSource(true);
      if (state.tab === 'ongoing') render();
    }).catch(function () { /* AniList недоступен — показываем данные файла */ });
  }

  // ── запуск ──
  buildDays();
  tabs.forEach(function (t) {
    t.addEventListener('click', function () { setTab(t.dataset.tab); });
    t.addEventListener('keydown', function (e) {
      var i = tabs.indexOf(t);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        var next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        next.focus();
        setTab(next.dataset.tab);
      }
    });
  });
  var searchTimer = null;
  searchEl.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { state.shown = PAGE; render(); }, 150);
  });
  moreBtn.addEventListener('click', function () { state.shown += PAGE; render(); });
  setInterval(tickCountdowns, 30000);
  render();

  fetch(DATA_URL, { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (json) {
      data = { ongoing: json.ongoing || [], premieres: json.premieres || [], sequels: json.sequels || [], generatedAt: json.generatedAt };
      data.ongoing.forEach(rollForward);
      updateCounts();
      setSource(false);
      render();
      refreshLive();
    })
    .catch(function () {
      listEl.replaceChildren(el('li', 'sched-empty', 'Не удалось загрузить расписание. Проверьте подключение и обновите страницу.'));
    });
})();
