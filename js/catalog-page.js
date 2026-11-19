/* Каталог жанра: карточки из data/anime.json вместо захардкоженных.
 *
 * Подключение в конце <body> страницы жанра (после watch-links.js и poster-fallback.js):
 *   <script src="../js/catalog-page.js" data-genre="drama"></script>
 * data-genre — ключ жанра из tools/genre-map.mjs. Если его нет, жанр определяется
 * по имени файла страницы через справочник genres в data/anime.json.
 *
 * Что делает:
 *  - берёт первую карточку страницы как шаблон, поэтому новые карточки свёрстаны
 *    в точности как старые (у каждой страницы своя разметка и свои цвета);
 *  - показывает тайтлы порциями по PAGE_SIZE с кнопкой «Показать ещё» и счётчиком;
 *  - заменяет поиск страницы (filterAnime) на поиск по всем тайтлам жанра
 *    (title, titleOriginal, titleEnglish); если в жанре не нашлось — подсказывает раздел;
 *  - кнопки «В избранное» вызывают addToFavorites страницы, как раньше, а «В ссылки»
 *    добавляет js/watch-links.js;
 *  - если data/anime.json не загрузился, оставляет старые карточки страницы.
 */
(function () {
  'use strict';

  var PAGE_SIZE = 24;
  var script = document.currentScript;
  var scriptSrc = (script && script.src) || location.href;
  var DATA_URL = new URL('../data/anime.json', scriptSrc).href;
  var PLACEHOLDER = new URL('../img/poster-placeholder.svg', scriptSrc).href;
  var META_KEY = 'animeverse_favorites_meta'; // постеры для страницы «Избранное»

  // ── Шаблон карточки: берём первую карточку страницы, пока её не изменили другие скрипты ──
  var firstCard = document.querySelector('.anime-item');
  if (!firstCard) return;
  var container = firstCard.parentElement;
  var template = firstCard.cloneNode(true);
  (function cleanTemplate() {
    var img = template.querySelector('img');
    if (img) Array.prototype.slice.call(img.attributes).forEach(function (a) {
      if (a.name !== 'class' && a.name !== 'style') img.removeAttribute(a.name);
    });
    var fav = template.querySelector('.favorite-button');
    if (fav) fav.removeAttribute('onclick');
    template.removeAttribute('style');
    template.querySelectorAll('.card-actions, .watch-link').forEach(function (el) { el.remove(); });
  })();

  var staticCards = Array.prototype.slice.call(document.querySelectorAll('.anime-item'));
  var noResults = document.getElementById('noResults');
  var hintBox = document.getElementById('otherCategoryHint');
  var searchInput = document.getElementById('animeSearch');

  // Пока каталог грузится — прячем старые карточки, чтобы не было «мигания»
  staticCards.forEach(function (c) { c.hidden = true; });
  var status = document.createElement('div');
  status.className = 'catalog-status';
  status.setAttribute('role', 'status');
  status.textContent = 'Загружаем каталог…';
  container.appendChild(status);

  var footer = document.createElement('div');
  footer.className = 'catalog-more';
  var counter = document.createElement('p');
  counter.className = 'catalog-counter';
  counter.setAttribute('aria-live', 'polite');
  var moreBtn = document.createElement('button');
  moreBtn.type = 'button';
  moreBtn.className = 'catalog-more-btn';
  footer.appendChild(counter);
  footer.appendChild(moreBtn);

  var catalog = null;     // весь data/anime.json
  var genreKey = null;
  var genreItems = [];    // тайтлы текущего жанра
  var current = [];       // после поиска
  var shown = 0;
  var searchTimer = null;

  function normalize(s) {
    return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }

  function detectGenre(data) {
    var fromAttr = script && script.dataset.genre;
    if (fromAttr && data.genres[fromAttr]) return fromAttr;
    var file = decodeURIComponent(location.pathname.split('/').pop() || '');
    for (var key in data.genres) {
      if (data.genres[key].page.split('/').pop() === file) return key;
    }
    return null;
  }

  function rememberMeta(item) {
    try {
      var meta = JSON.parse(localStorage.getItem(META_KEY) || '{}') || {};
      meta[item.title] = { poster: item.poster, id: item.id, titleOriginal: item.titleOriginal || null };
      localStorage.setItem(META_KEY, JSON.stringify(meta));
    } catch (e) { /* хранилище недоступно — избранное всё равно сохранится, но без постера */ }
  }

  function buildCard(item) {
    var card = template.cloneNode(true);
    card.dataset.animeId = item.id;
    // все названия — для кнопки «▶ Смотреть» (js/watch-modal.js подставит недостающие)
    card.dataset.titleRu = item.title || '';
    card.dataset.titleEn = item.titleEnglish || '';
    card.dataset.titleOrig = item.titleOriginal || '';
    // год выхода из каталога (поле year); если его нет — не выводим вовсе
    var year = Number.isInteger(item.year) ? item.year : null;
    if (year) card.dataset.year = String(year);

    var img = card.querySelector('img');
    if (img) {
      img.alt = item.title;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('error', function onErr() {
        img.removeEventListener('error', onErr);
        img.classList.add('poster-missing');
        img.src = PLACEHOLDER;
      });
      img.src = item.poster || PLACEHOLDER;
    }

    var title = card.querySelector('.anime-title');
    if (title) {
      title.textContent = item.title;
      var orig = item.titleOriginal && item.titleOriginal !== item.title ? item.titleOriginal : '';
      if (orig) title.title = orig;
      // отдельный элемент, а не часть названия: название читают «В ссылки», «Смотреть» и поиск
      if (year) {
        var yearEl = document.createElement('div');
        yearEl.className = 'anime-year';
        yearEl.textContent = String(year);
        yearEl.setAttribute('aria-label', 'Год выхода: ' + year);
        title.insertAdjacentElement('afterend', yearEl);
      }
    }

    var desc = card.querySelector('.anime-desc');
    if (desc) {
      desc.textContent = item.synopsis || 'Описание пока не добавлено.';
      // описания переведены tools/translate-catalog.mjs; если перевода нет — остаётся английский оригинал
      desc.lang = !item.synopsis || /[а-яё]/i.test(item.synopsis) ? 'ru' : 'en';
    }

    var fav = card.querySelector('.favorite-button');
    if (fav) {
      fav.addEventListener('click', function () {
        rememberMeta(item);
        if (typeof window.addToFavorites === 'function') window.addToFavorites(fav, item.title);
      });
    }
    return card;
  }

  // ── Фильтр по году выхода (выпадающий список рядом с поиском) ──
  var yearSelect = null;

  function selectedYear() {
    var v = yearSelect ? parseInt(yearSelect.value, 10) : NaN;
    return Number.isInteger(v) ? v : null;
  }

  function buildYearFilter() {
    var wrapper = searchInput && searchInput.parentElement;
    if (!wrapper) return;
    // только годы, которые реально есть у тайтлов этого жанра, — по убыванию, с количеством
    var counts = {};
    genreItems.forEach(function (a) { if (Number.isInteger(a.year)) counts[a.year] = (counts[a.year] || 0) + 1; });
    var years = Object.keys(counts).map(Number).sort(function (a, b) { return b - a; });
    if (!years.length) return;

    yearSelect = document.createElement('select');
    yearSelect.id = 'yearFilter';
    yearSelect.className = 'year-filter';
    yearSelect.setAttribute('aria-label', 'Год выхода');
    yearSelect.title = 'Год выхода';
    var all = document.createElement('option');
    all.value = '';
    all.textContent = 'Все годы';
    yearSelect.appendChild(all);
    years.forEach(function (y) {
      var o = document.createElement('option');
      o.value = String(y);
      o.textContent = y + ' (' + counts[y] + ')';
      yearSelect.appendChild(o);
    });
    yearSelect.addEventListener('change', search);
    searchInput.insertAdjacentElement('afterend', yearSelect);
    wrapper.classList.add('has-year-filter');
  }

  function updateFooter() {
    var total = current.length;
    var filtered = (searchInput && searchInput.value.trim()) || selectedYear();
    counter.textContent = total
      ? (filtered ? 'Найдено ' + total + ' · показано ' + shown : 'Показано ' + shown + ' из ' + total)
      : '';
    var left = total - shown;
    moreBtn.hidden = left <= 0;
    moreBtn.textContent = 'Показать ещё ' + Math.min(PAGE_SIZE, left);
    footer.hidden = !total;
    container.appendChild(footer); // всегда в конце списка
  }

  function renderMore() {
    var batch = current.slice(shown, shown + PAGE_SIZE);
    var frag = document.createDocumentFragment();
    var cards = batch.map(buildCard);
    cards.forEach(function (c) { frag.appendChild(c); });
    container.insertBefore(frag, footer.parentNode === container ? footer : null);
    shown += batch.length;
    if (window.AnimeWatchLinks) window.AnimeWatchLinks.decorate(cards);
    if (window.AnimeWatchModal) window.AnimeWatchModal.decorate(cards);
    updateFooter();
  }

  function renderList(items) {
    container.querySelectorAll('.anime-item[data-anime-id]').forEach(function (c) { c.remove(); });
    current = items;
    shown = 0;
    renderMore();
  }

  function showHint(match) {
    if (!hintBox) return;
    if (!match) { hintBox.style.display = 'none'; hintBox.textContent = ''; return; }
    var otherKey = match.genres.filter(function (g) { return g !== genreKey; })[0];
    var g = otherKey && catalog.genres[otherKey];
    if (!g) { hintBox.style.display = 'none'; return; }
    var link = document.createElement('a');
    link.href = g.page.split('/').pop();
    link.textContent = g.name;
    var b = document.createElement('b');
    b.textContent = '"' + match.title + '"';
    hintBox.replaceChildren(document.createTextNode('🔍 Аниме '), b, document.createTextNode(' найдено в разделе '), link);
    hintBox.style.display = 'block';
  }

  // Поиск по названию и фильтр по году работают вместе; «Показать ещё» листает уже отфильтрованный список
  function search() {
    var q = normalize(searchInput ? searchInput.value : '');
    var year = selectedYear();
    var base = year ? genreItems.filter(function (a) { return a.year === year; }) : genreItems;
    var found = q ? base.filter(function (a) { return a._search.indexOf(q) !== -1; }) : base;
    renderList(found);
    if (found.length) {
      if (noResults) noResults.style.display = 'none';
      showHint(null);
      return;
    }
    // В этом жанре нет — подсказываем раздел, как раньше (только для поиска без выбранного года:
    // в другом разделе тайтл может оказаться другого года)
    var other = q.length >= 2 && !year ? catalog.anime.filter(function (a) { return a._search.indexOf(q) !== -1; })[0] : null;
    showHint(other);
    if (noResults) noResults.style.display = other ? 'none' : 'block';
  }

  // Поиск страницы (onkeyup="filterAnime()") теперь ищет по всему каталогу жанра
  window.filterAnime = function () {
    if (!catalog) return; // пока каталог не загрузился, оставляем как есть
    clearTimeout(searchTimer);
    searchTimer = setTimeout(search, 120);
  };

  moreBtn.addEventListener('click', renderMore);

  function fail(reason) {
    console.warn('Каталог не загружен, показываем карточки страницы:', reason);
    status.remove();
    staticCards.forEach(function (c) { c.hidden = false; });
  }

  fetch(DATA_URL, { cache: 'default' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (data) {
      genreKey = detectGenre(data);
      if (!genreKey) return fail('жанр страницы не найден в каталоге');
      catalog = data;
      data.anime.forEach(function (a) {
        a._search = normalize([a.title, a.titleOriginal, a.titleEnglish].join(' '));
      });
      genreItems = data.anime.filter(function (a) { return a.genres.indexOf(genreKey) !== -1; });
      if (!genreItems.length) return fail('в каталоге нет тайтлов этого жанра');

      staticCards.forEach(function (c) { c.remove(); });
      status.remove();
      document.body.dataset.catalogGenre = genreKey;
      buildYearFilter();
      if (searchInput && searchInput.value.trim()) search(); else renderList(genreItems);
    })
    .catch(function (err) { fail(err.message); });
})();
