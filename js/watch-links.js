/* Кнопки «🔗 Смотреть / В ссылки» на карточках каталога (главная и жанровые страницы).
 *
 * Связь с облачным трекером pages/ssylky.html идёт через localStorage (общий для страниц сайта):
 *  - animeverse_links       — трекер пишет сюда «название → ссылка» для сохранённых тайтлов;
 *  - animeverse_watch_queue — сюда каталог пишет, какой тайтл открыли, а трекер при открытии
 *                             обновляет lastWatched и переводит «Хочу» → «Смотрю».
 * Если тайтл уже сохранён со ссылкой — кнопка открывает эту ссылку, иначе ведёт в трекер
 * с параметрами ?add=1&title=..., где форма добавления заполнится сама.
 */
(function () {
  'use strict';

  var LINKS_KEY = 'animeverse_links';
  var QUEUE_KEY = 'animeverse_watch_queue';

  // Путь к трекеру считаем от адреса самого скрипта (js/watch-links.js),
  // поэтому он верен и для index.html в корне, и для страниц в pages/.
  var scriptSrc = (document.currentScript && document.currentScript.src) || location.href;
  var TRACKER_URL = new URL('../pages/ssylky.html', scriptSrc);

  function normalizeTitle(s) {
    return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }

  function isHttpUrl(s) {
    try { var u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; } catch (e) { return false; }
  }

  function readLinks() {
    try { return JSON.parse(localStorage.getItem(LINKS_KEY) || '{}') || {}; } catch (e) { return {}; }
  }

  function queueWatch(title) {
    try {
      var queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      if (!Array.isArray(queue)) queue = [];
      queue.push({ title: title, ts: Date.now() });
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-20)));
    } catch (e) { /* хранилище недоступно — просто открываем ссылку */ }
  }

  function updateButton(btn, links) {
    var title = btn.dataset.title;
    var saved = links[normalizeTitle(title)];
    if (saved && isHttpUrl(saved.url)) {
      btn.href = saved.url;
      btn.target = '_blank';
      btn.rel = 'noopener';
      btn.textContent = '🔗 Смотреть';
      btn.title = 'Открыть сохранённую ссылку на «' + saved.title + '»';
      btn.dataset.savedTitle = saved.title;
      btn.classList.add('is-saved');
    } else {
      var url = new URL(TRACKER_URL.href);
      url.searchParams.set('add', '1');
      url.searchParams.set('title', title);
      btn.href = url.href;
      btn.removeAttribute('target');
      btn.removeAttribute('rel');
      btn.textContent = '🔗 В ссылки';
      btn.title = 'Добавить ссылку на просмотр в AnimeVerse';
      delete btn.dataset.savedTitle;
      btn.classList.remove('is-saved');
    }
  }

  function createButton(title) {
    var btn = document.createElement('a');
    btn.className = 'watch-link';
    btn.dataset.title = title;
    btn.addEventListener('click', function () {
      if (btn.dataset.savedTitle) queueWatch(btn.dataset.savedTitle);
    });
    return btn;
  }

  // Жанровые страницы: .anime-item > (.anime-info или просто div) > .anime-title + .favorite-button
  function decorateItem(item, links) {
    var titleEl = item.querySelector('.anime-title');
    if (!titleEl || item.querySelector('.watch-link')) return;
    var info = titleEl.parentElement;
    var actions = document.createElement('div');
    actions.className = 'card-actions';
    var fav = info.querySelector('.favorite-button');
    if (fav) { info.insertBefore(actions, fav); actions.appendChild(fav); } else { info.appendChild(actions); }
    var btn = createButton(titleEl.textContent.trim());
    actions.appendChild(btn);
    updateButton(btn, links);
  }

  // Для карточек, которые появляются позже (каталог js/catalog-page.js): AnimeWatchLinks.decorate(cards)
  window.AnimeWatchLinks = {
    decorate: function (items) {
      var links = readLinks();
      Array.prototype.forEach.call(items || document.querySelectorAll('.anime-item'), function (item) { decorateItem(item, links); });
    }
  };

  function init() {
    var links = readLinks();

    document.querySelectorAll('.anime-item').forEach(function (item) { decorateItem(item, links); });

    // Главная: .anime-card > h3
    document.querySelectorAll('.anime-cards .anime-card').forEach(function (card) {
      var titleEl = card.querySelector('h3');
      if (!titleEl || card.querySelector('.watch-link')) return;
      // если у карточки уже есть ряд кнопок («▶ Где посмотреть») — встаём в него
      var actions = card.querySelector('.anime-card-actions');
      if (!actions) {
        actions = document.createElement('div');
        actions.className = 'card-actions';
        card.appendChild(actions);
      }
      var btn = createButton(titleEl.textContent.trim());
      actions.appendChild(btn);
      updateButton(btn, links);
    });
  }

  function refresh() {
    var links = readLinks();
    document.querySelectorAll('.watch-link').forEach(function (btn) { updateButton(btn, links); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  // Ссылку сохранили в трекере в другой вкладке или вернулись кнопкой «Назад» — обновляем кнопки
  window.addEventListener('storage', function (e) { if (e.key === LINKS_KEY) refresh(); });
  window.addEventListener('pageshow', function (e) { if (e.persisted) refresh(); });
})();
