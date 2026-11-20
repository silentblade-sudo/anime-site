/* Кнопка «▶ Смотреть» на карточках жанров и окно выбора площадки.
 *
 * Подключение в конце <body> (после js/watch-platforms.js, js/watch-links.js и js/catalog-page.js):
 *   <script src="../js/watch-platforms.js"></script>
 *   <script src="../js/watch-modal.js"></script>
 *
 * Кнопка добавляется в .card-actions каждой .anime-item (справа от «В избранное» и «В ссылки»).
 * Названия берутся из data-атрибутов карточки, которые ставит js/catalog-page.js
 * (data-title-ru / data-title-en / data-title-orig), а для старых статических карточек —
 * из названия и alt постера. Пустых названий не бывает: каждое поле подменяется соседним.
 *
 * Для порций, которые появляются позже: AnimeWatchModal.decorate(cards).
 * Своя кнопка на странице: <button class="watch-now-btn" data-title-ru="…" data-title-en="…"> — откроется сама.
 * Карточки с атрибутом data-no-watch автоматически не получают кнопку.
 *
 * В окне есть поиск «Найти другое аниме» — общий движок js/anime-search.js (подключается сам при первом вводе):
 * подсказки ведут на страницу жанра с ?anime=<id> (js/catalog-page.js прокрутит к карточке) или на страницу фильма.
 * Стили — css/watch-modal.css.
 */
(function () {
  'use strict';

  var PLATFORMS = window.WATCH_PLATFORMS || [];
  var LATIN = /[a-z]/i;
  var dialog = null;
  var lastButton = null;

  // Пути от расположения самого скрипта (js/), поэтому одинаково работают с главной и из pages/
  var SCRIPT_SRC = (document.currentScript && document.currentScript.src) || location.href;
  var SUGGEST_LIMIT = 8;

  // ── Названия тайтла с фолбэками ──
  function namesFor(card) {
    var d = card.dataset;
    var shown = (card.querySelector('.anime-title') || {}).textContent || '';
    var alt = (card.querySelector('img') || {}).alt || '';
    var ru = (d.titleRu || shown).trim();
    var en = (d.titleEn || '').trim();
    var orig = (d.titleOrig || '').trim();
    if (!en && LATIN.test(alt) && !/[а-яё]/i.test(alt)) en = alt.trim(); // у старых карточек alt часто на английском
    ru = ru || en || orig;
    en = en || orig || ru;
    orig = orig || en || ru;
    return { ru: ru, en: en, orig: orig };
  }

  function buildUrl(p, names) {
    var q = names[p.query] || names.ru;
    if (p.suffix) q += ' ' + p.suffix;
    return p.url.replace('{q}', encodeURIComponent(q));
  }

  // ── Кнопка в карточке ──
  function decorateItem(card) {
    var titleEl = card.querySelector('.anime-title');
    // data-no-watch — страница сама решает, где нужна кнопка (например, «Избранное»)
    if (!titleEl || card.hasAttribute('data-no-watch') || card.querySelector('.watch-now-btn')) return;
    var actions = card.querySelector('.card-actions');
    if (!actions) {
      // на случай, если js/watch-links.js не подключён: собираем такой же блок действий
      var info = titleEl.parentElement;
      actions = document.createElement('div');
      actions.className = 'card-actions';
      var fav = info.querySelector('.favorite-button');
      if (fav) { info.insertBefore(actions, fav); actions.appendChild(fav); } else { info.appendChild(actions); }
    }
    var names = namesFor(card);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'watch-now-btn';
    btn.textContent = '▶ Смотреть';
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.dataset.titleRu = names.ru;
    btn.dataset.titleEn = names.en;
    btn.dataset.titleOrig = names.orig;
    if (card.dataset.year) btn.dataset.year = card.dataset.year; // год из каталога; у старых карточек его нет
    btn.title = 'Где посмотреть «' + names.ru + '»';
    actions.appendChild(btn);
  }

  function decorate(items) {
    Array.prototype.forEach.call(items || document.querySelectorAll('.anime-item'), decorateItem);
  }

  // ── Окно ──
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function ensureDialog() {
    if (dialog) return dialog;
    dialog = el('dialog', 'watch-modal');
    dialog.setAttribute('aria-labelledby', 'watch-modal-title');

    var box = el('div', 'watch-modal-box');
    var head = el('div', 'watch-modal-head');
    var titles = el('div', 'watch-modal-titles');
    var kicker = el('p', 'watch-modal-kicker', 'Где посмотреть');
    var h = el('h2', 'watch-modal-title');
    h.id = 'watch-modal-title';
    var sub = el('p', 'watch-modal-sub');
    titles.append(kicker, h, sub);
    var close = el('button', 'watch-modal-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Закрыть');
    close.addEventListener('click', function () { dialog.close(); });
    head.append(titles, close);

    var body = el('div', 'watch-modal-body');
    var foot = el('p', 'watch-modal-foot', 'Ссылки открывают поиск на площадке в новой вкладке. Есть ли там этот тайтл — зависит от площадки и вашего региона.');
    box.append(head, buildSearch(), body, foot);
    dialog.appendChild(box);

    // Клик по затемнённому фону (сам <dialog> вне его содержимого) закрывает окно
    dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });
    // Escape закрывает <dialog> сам; возвращаем фокус на кнопку, с которой открыли
    dialog.addEventListener('close', function () {
      if (lastButton && document.contains(lastButton)) lastButton.focus();
    });
    document.body.appendChild(dialog);
    return dialog;
  }

  // ── Поиск другого аниме внутри окна: общий движок js/anime-search.js ──
  // (русские, английские, оригинальные названия, синонимы AniList и словарь обиходных названий;
  //  подсказки ведут на страницу жанра с ?anime=<id> или на страницу фильма)
  var searchTimer = null;
  var enginePromise = null;

  // Движок подключаем сами, если страница его не подключила
  function engine() {
    if (window.AnimeSearch) return window.AnimeSearch.load();
    if (!enginePromise) {
      enginePromise = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = new URL('anime-search.js', SCRIPT_SRC).href;
        s.onload = function () { window.AnimeSearch ? resolve() : reject(new Error('AnimeSearch не найден')); };
        s.onerror = function () { enginePromise = null; reject(new Error('anime-search.js не загрузился')); };
        document.head.appendChild(s);
      });
    }
    return enginePromise.then(function () { return window.AnimeSearch.load(); });
  }

  function normalize(s) {
    return window.AnimeSearch ? window.AnimeSearch.normalize(s)
      : String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }

  function renderSuggestions() {
    var d = ensureDialog();
    var input = d.querySelector('.watch-search-input');
    var list = d.querySelector('.watch-search-list');
    var status = d.querySelector('.watch-search-status');
    var q = normalize(input.value);
    list.replaceChildren();
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    if (q.length < 2) { status.textContent = q ? 'Введите хотя бы 2 буквы' : ''; return; }

    status.textContent = 'Ищем…';
    engine().then(function (search) {
      if (normalize(input.value) !== q) return; // пока грузили, запрос поменялся
      var found = search.find(q, { limit: SUGGEST_LIMIT });
      if (!found.length) { status.textContent = 'Ничего не найдено'; return; }
      status.textContent = 'Найдено: ' + found.length + (found.length === SUGGEST_LIMIT ? '+' : '') + '. Нажмите, чтобы открыть раздел.';
      found.forEach(function (r) {
        var li = document.createElement('li');
        var link = el('a', 'watch-suggestion');
        link.href = r.href;
        var title = el('span', 'watch-suggestion-title', r.title);
        var meta = el('span', 'watch-suggestion-meta');
        meta.appendChild(el('span', 'watch-suggestion-genre' + (r.type === 'movie' ? ' is-movie' : ''), r.section));
        if (r.extra) meta.appendChild(document.createTextNode(' · ' + r.extra));
        link.append(title, meta);
        li.appendChild(link);
        list.appendChild(li);
      });
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }).catch(function () {
      status.textContent = 'Не удалось загрузить каталог. Проверьте подключение и попробуйте ещё раз.';
    });
  }

  function buildSearch() {
    var wrap = el('div', 'watch-modal-search');
    var label = el('label', 'watch-search-label', 'Найти другое аниме');
    label.htmlFor = 'watch-search-input';
    var input = el('input', 'watch-search-input');
    input.type = 'search';
    input.id = 'watch-search-input';
    input.placeholder = 'Название на русском, английском или японском';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-controls', 'watch-search-list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-describedby', 'watch-search-status');
    var status = el('p', 'watch-search-status');
    status.id = 'watch-search-status';
    status.setAttribute('aria-live', 'polite');
    var list = el('ul', 'watch-search-list');
    list.id = 'watch-search-list';
    list.setAttribute('aria-label', 'Подсказки');
    list.hidden = true;

    input.addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(renderSuggestions, 150);
    });
    // Стрелки: из поля — к подсказкам и обратно, по подсказкам — вверх/вниз; Enter открывает ссылку
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        var firstLink = list.querySelector('a');
        if (firstLink) { e.preventDefault(); firstLink.focus(); }
      } else if (e.key === 'Enter') {
        var only = list.querySelector('a');
        if (only) { e.preventDefault(); location.href = only.href; }
      }
    });
    list.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      var links = Array.prototype.slice.call(list.querySelectorAll('a'));
      var i = links.indexOf(document.activeElement);
      if (i === -1) return;
      e.preventDefault();
      if (e.key === 'ArrowDown') (links[i + 1] || links[i]).focus();
      else if (i === 0) input.focus();
      else links[i - 1].focus();
    });

    wrap.append(label, input, status, list);
    return wrap;
  }

  function resetSearch() {
    var d = ensureDialog();
    clearTimeout(searchTimer);
    d.querySelector('.watch-search-input').value = '';
    d.querySelector('.watch-search-input').setAttribute('aria-expanded', 'false');
    d.querySelector('.watch-search-status').textContent = '';
    var list = d.querySelector('.watch-search-list');
    list.replaceChildren();
    list.hidden = true;
  }

  function fill(names) {
    var d = ensureDialog();
    d.querySelector('.watch-modal-title').textContent = names.ru;
    var sub = d.querySelector('.watch-modal-sub');
    // другие названия под заголовком, без повторов (в том числе отличающихся только регистром)
    var seen = [names.ru.toLowerCase()];
    var extra = [names.en, names.orig].filter(function (n) {
      if (!n || seen.indexOf(n.toLowerCase()) !== -1) return false;
      seen.push(n.toLowerCase());
      return true;
    });
    if (names.year) extra.unshift(names.year); // год первым: «2006 · Death Note»
    sub.textContent = extra.join(' · ');
    sub.hidden = !extra.length;

    var body = d.querySelector('.watch-modal-body');
    body.replaceChildren();
    var groups = [];
    PLATFORMS.forEach(function (p) { if (groups.indexOf(p.group) === -1) groups.push(p.group); });
    groups.forEach(function (g) {
      var section = el('section', 'watch-group');
      section.appendChild(el('h3', 'watch-group-title', g));
      var grid = el('div', 'watch-grid');
      PLATFORMS.filter(function (p) { return p.group === g; }).forEach(function (p) {
        var a = el('a', 'watch-platform');
        a.href = buildUrl(p, names);
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.appendChild(el('span', 'watch-platform-name', p.name));
        if (p.note) a.appendChild(el('span', 'watch-platform-note', p.note));
        a.setAttribute('aria-label', p.name + (p.note ? ' (' + p.note + ')' : '') + ' — откроется в новой вкладке');
        grid.appendChild(a);
      });
      section.appendChild(grid);
      body.appendChild(section);
    });
  }

  function open(btn) {
    lastButton = btn;
    fill({ ru: btn.dataset.titleRu, en: btn.dataset.titleEn, orig: btn.dataset.titleOrig, year: btn.dataset.year || '' });
    var d = ensureDialog();
    resetSearch();
    d.querySelector('.watch-modal-body').scrollTop = 0;
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    d.querySelector('.watch-modal-close').focus();
  }

  // Одно делегированное событие на все кнопки, включая подгруженные позже
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.watch-now-btn');
    if (btn) open(btn);
  });

  window.AnimeWatchModal = { decorate: decorate, open: open };

  // Статические карточки (если каталог не загрузился) — после js/watch-links.js
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { decorate(); });
  else decorate();
})();
