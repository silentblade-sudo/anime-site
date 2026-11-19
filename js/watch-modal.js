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
 */
(function () {
  'use strict';

  var PLATFORMS = window.WATCH_PLATFORMS || [];
  var LATIN = /[a-z]/i;
  var dialog = null;
  var lastButton = null;

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
    if (!titleEl || card.querySelector('.watch-now-btn')) return;
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
    box.append(head, body, foot);
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
