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
 *  - если data/anime.json не загрузился, оставляет старые карточки страницы;
 *  - по адресу «?anime=<id>» догружает нужную порцию, прокручивает к карточке и подсвечивает её.
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

  // ── Вид каталога: «Сетка» (по умолчанию) или «Список»; выбор хранится в localStorage ──
  var VIEW_KEY = 'animeverse_catalog_view';
  var FORMAT_LABELS = { TV: 'ТВ-сериал', TV_SHORT: 'Короткий ТВ', MOVIE: 'Фильм', OVA: 'OVA', ONA: 'ONA', SPECIAL: 'Спешл', MUSIC: 'Клип' };
  var viewButtons = [];

  function savedView() {
    try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'; } catch (e) { return 'grid'; }
  }
  function applyView(mode) {
    var grid = mode !== 'list';
    // У кнопок карточек на страницах transition: all — без этого при смене вида текст
    // «вырастал» из нуля. Переключаем без анимаций и сразу пересчитываем раскладку.
    document.body.classList.add('catalog-view-switching');
    container.classList.toggle('catalog-grid', grid);
    // блоки .anime-list вокруг карточек (на некоторых страницах их два, вложенных) — на всю ширину
    for (var el = container; el && el !== document.body; el = el.parentElement) {
      if (el.classList.contains('anime-list')) el.classList.toggle('catalog-wide', grid);
    }
    document.body.dataset.catalogView = grid ? 'grid' : 'list';
    viewButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.view === (grid ? 'grid' : 'list'))); });
    void container.offsetWidth; // стили применены уже без анимаций
    document.body.classList.remove('catalog-view-switching');
  }
  function setView(mode) {
    try { localStorage.setItem(VIEW_KEY, mode); } catch (e) { /* приватный режим — выбор живёт до перезагрузки */ }
    applyView(mode);
  }

  // В сетке кнопки карточки показываются иконками: иконка — из data-icon, полный текст — в title и для читалок
  var ACTION_ICONS = [['favorite-button', '★'], ['watch-link', '🔗'], ['watch-now-btn', '▶']];
  function tagActionIcons(cards) {
    Array.prototype.forEach.call(cards, function (card) {
      ACTION_ICONS.forEach(function (pair) {
        card.querySelectorAll('.' + pair[0]).forEach(function (btn) {
          btn.dataset.icon = pair[1];
          if (!btn.title) btn.title = btn.textContent.replace(/\s+/g, ' ').trim();
        });
      });
    });
  }

  var VIEW_ICONS = {
    grid: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><rect x="2" y="2" width="7" height="7" rx="1.5" fill="currentColor"/><rect x="11" y="2" width="7" height="7" rx="1.5" fill="currentColor"/><rect x="2" y="11" width="7" height="7" rx="1.5" fill="currentColor"/><rect x="11" y="11" width="7" height="7" rx="1.5" fill="currentColor"/></svg>',
    list: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><rect x="2" y="3" width="5" height="5" rx="1" fill="currentColor"/><rect x="9" y="4" width="9" height="3" rx="1.5" fill="currentColor"/><rect x="2" y="12" width="5" height="5" rx="1" fill="currentColor"/><rect x="9" y="13" width="9" height="3" rx="1.5" fill="currentColor"/></svg>'
  };
  function buildViewToggle() {
    var wrapper = searchInput && searchInput.parentElement;
    var group = document.createElement('div');
    group.className = 'view-toggle';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Вид каталога');
    [['grid', 'Сетка'], ['list', 'Список']].forEach(function (v) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'view-btn';
      b.dataset.view = v[0];
      b.title = v[1] === 'Сетка' ? 'Сетка постеров' : 'Список с описанием';
      b.innerHTML = VIEW_ICONS[v[0]] + '<span class="view-btn-label">' + v[1] + '</span>';
      b.addEventListener('click', function () { setView(v[0]); });
      viewButtons.push(b);
      group.appendChild(b);
    });
    if (wrapper) {
      wrapper.appendChild(group);
      wrapper.classList.add('has-year-filter', 'has-view-toggle');
    } else {
      container.parentElement.insertBefore(group, container);
    }
    applyView(savedView());
  }

  // Вид применяем сразу, ещё до загрузки каталога, — без «прыжка» от списка к сетке
  applyView(savedView());
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

    // Постер и название ведут в каталог (pages/movies.html) на вкладку «Аниме» к этому тайтлу.
    // Кнопки карточки («В избранное», «В ссылки», «Смотреть») остаются отдельными и работают как раньше.
    var catalogHref = 'movies.html?tab=anime&anime=' + encodeURIComponent(item.id);
    if (img) {
      var posterLink = document.createElement('a');
      posterLink.className = 'anime-poster-link';
      posterLink.href = catalogHref;
      posterLink.setAttribute('aria-label', item.title + ' — открыть в каталоге аниме');
      img.parentNode.insertBefore(posterLink, img);
      posterLink.appendChild(img);
    }

    var title = card.querySelector('.anime-title');
    if (title) {
      title.textContent = '';
      var titleLink = document.createElement('a');
      titleLink.className = 'anime-title-link';
      titleLink.href = catalogHref;
      titleLink.textContent = item.title;
      title.appendChild(titleLink);
      var orig = item.titleOriginal && item.titleOriginal !== item.title ? item.titleOriginal : '';
      if (orig) title.title = orig;
      // отдельный элемент, а не часть названия: название читают «В ссылки», «Смотреть» и поиск
      // Под названием — год и тип (ТВ-сериал, фильм, OVA…); если данных нет, плашки не выводим
      var typeLabel = FORMAT_LABELS[item.format] || '';
      if (year || typeLabel) {
        var meta = document.createElement('div');
        meta.className = 'anime-meta';
        if (year) {
          var yearEl = document.createElement('span');
          yearEl.className = 'anime-year';
          yearEl.textContent = String(year);
          yearEl.setAttribute('aria-label', 'Год выхода: ' + year);
          meta.appendChild(yearEl);
        }
        if (typeLabel) {
          var typeEl = document.createElement('span');
          typeEl.className = 'anime-type';
          typeEl.textContent = typeLabel;
          typeEl.setAttribute('aria-label', 'Тип: ' + typeLabel);
          meta.appendChild(typeEl);
        }
        title.insertAdjacentElement('afterend', meta);
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

  // ── Переход в другой жанр (выпадающий список справа от «Все годы») ──
  // Жанры и их страницы — из справочника genres в data/anime.json, сгруппированы как в меню сайта.
  function buildGenreSwitch() {
    var wrapper = searchInput && searchInput.parentElement;
    if (!wrapper || !catalog.genres) return;

    var select = document.createElement('select');
    select.id = 'genreSwitch';
    select.className = 'year-filter genre-switch'; // оформление — как у «Все годы»
    select.setAttribute('aria-label', 'Перейти в другой жанр');
    select.title = 'Перейти в другой жанр';

    var groups = {};
    var order = [];
    Object.keys(catalog.genres).forEach(function (key) {
      var g = catalog.genres[key];
      var group = g.group || 'Другие';
      if (!groups[group]) { groups[group] = []; order.push(group); }
      groups[group].push({ key: key, name: g.name, file: g.page.split('/').pop() });
    });
    order.forEach(function (group) {
      var og = document.createElement('optgroup');
      og.label = group;
      groups[group].forEach(function (g) {
        var o = document.createElement('option');
        o.value = g.file; // страницы жанров лежат в одной папке pages/
        o.textContent = g.name;
        if (g.key === genreKey) { o.selected = true; o.textContent = g.name + ' — сейчас'; }
        og.appendChild(o);
      });
      select.appendChild(og);
    });
    var current = select.value;

    function go() {
      if (select.value && select.value !== current) location.href = select.value;
    }
    // Мышью/пальцем выбор сразу открывает жанр. С клавиатуры стрелки и буквы на закрытом списке
    // в некоторых браузерах сразу меняют значение — тогда переходим только по Enter, а не на каждое нажатие.
    var lastKey = 0;
    select.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); go(); return; }
      if (e.key !== 'Tab' && e.key !== 'Escape') lastKey = Date.now();
    });
    select.addEventListener('change', function () {
      if (Date.now() - lastKey < 400) return; // смена стрелками — ждём Enter
      go();
    });
    // вернулись «Назад» из кэша браузера — показываем текущий жанр, а не выбранный ранее
    window.addEventListener('pageshow', function () { select.value = current; });

    (yearSelect || searchInput).insertAdjacentElement('afterend', select);
    wrapper.classList.add('has-year-filter', 'has-genre-switch');
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
    tagActionIcons(cards);
    updateFooter();
  }

  function renderList(items) {
    container.querySelectorAll('.anime-item[data-anime-id]').forEach(function (c) { c.remove(); });
    current = items;
    shown = 0;
    renderMore();
  }

  // Место каждого тайтла в списке каждого жанра (считается один раз, при первой подсказке)
  var genreRank = null;
  function rankIn(genre, id) {
    if (!genreRank) {
      genreRank = {};
      Object.keys(catalog.genres).forEach(function (g) {
        var i = 0;
        genreRank[g] = {};
        catalog.anime.forEach(function (a) { if (a.genres.indexOf(g) !== -1) genreRank[g][a.id] = i++; });
      });
    }
    var r = genreRank[genre] && genreRank[genre][id];
    return r === undefined ? Infinity : r;
  }

  // Раздел для перехода: среди других жанров тайтла — тот, где он стоит выше всего
  // (почти всегда в первой порции страницы); при равенстве — более крупный жанр.
  // Так же выбирает раздел поиск по сайту (js/anime-search.js).
  function bestOtherGenre(match) {
    var best = null, bestRank = Infinity;
    match.genres.forEach(function (g) {
      if (g === genreKey || !catalog.genres[g]) return;
      var r = rankIn(g, match.id);
      var bigger = best && (catalog.genres[g].count || 0) > (catalog.genres[best].count || 0);
      if (r < bestRank || (r === bestRank && bigger)) { best = g; bestRank = r; }
    });
    return best;
  }

  // Подсказка «Аниме "…" найдено в разделе …»: ссылка сразу ведёт к тайтлу (?anime=<id>) —
  // страница жанра догрузит карточки до него, прокрутит и подсветит, вводить запрос заново не нужно
  function showHint(match) {
    if (!hintBox) return;
    if (!match) { hintBox.style.display = 'none'; hintBox.textContent = ''; return; }
    var otherKey = bestOtherGenre(match);
    var g = otherKey && catalog.genres[otherKey];
    if (!g) { hintBox.style.display = 'none'; hintBox.textContent = ''; return; }
    var link = document.createElement('a');
    link.href = g.page.split('/').pop() + '?anime=' + encodeURIComponent(match.id);
    link.textContent = g.name + ' →';
    link.title = 'Открыть «' + match.title + '» в разделе ' + g.name;
    var b = document.createElement('b');
    b.textContent = '"' + match.title + '"';
    hintBox.replaceChildren(document.createTextNode('🔍 Аниме '), b, document.createTextNode(' найдено в разделе '), link);
    hintBox.style.display = 'block';
  }

  // Поиск по названию и фильтр по году работают вместе; «Показать ещё» листает уже отфильтрованный список
  // ── Общий поисковый движок js/anime-search.js: синонимы AniList (data/anime-synonyms.json),
  //    словарь обиходных названий («ветролом» → WIND BREAKER), «ё» = «е». Подключается при первом поиске;
  //    пока он грузится (или если не загрузился), работает простой поиск по трём названиям тайтла.
  var engine = null;          // window.AnimeSearch после загрузки
  var enginePromise = null;
  var engineFailed = false;

  function loadEngine() {
    if (engine || engineFailed) return enginePromise || Promise.resolve();
    if (!enginePromise) {
      enginePromise = new Promise(function (resolve, reject) {
        if (window.AnimeSearch) return resolve();
        var s = document.createElement('script');
        s.src = new URL('anime-search.js', scriptSrc).href;
        s.onload = function () { window.AnimeSearch ? resolve() : reject(new Error('AnimeSearch не найден')); };
        s.onerror = function () { reject(new Error('anime-search.js не загрузился')); };
        document.head.appendChild(s);
      }).then(function () {
        return window.AnimeSearch.load();
      }).then(function (api) {
        engine = api;
        if (searchInput && searchInput.value.trim()) search(); // пересчитываем уже набранный запрос
      }).catch(function (err) {
        engineFailed = true;
        console.warn('Поиск по синонимам недоступен, ищем по основным названиям:', err.message);
        if (searchInput && searchInput.value.trim()) search();
      });
    }
    return enginePromise;
  }

  // Подходящие тайтлы из списка: с движком — по всем названиям и синонимам, сначала точные совпадения;
  // без движка — по трём названиям в порядке каталога
  function matchItems(items, q) {
    if (!q) return items;
    if (engine) {
      var scores = engine.scoreAll(q);
      return items.filter(function (a) { return scores[a.id] !== undefined; })
        .sort(function (x, y) { return scores[x.id] - scores[y.id] || x._order - y._order; });
    }
    return items.filter(function (a) { return a._search.indexOf(q) !== -1; });
  }

  function search() {
    var q = normalize(searchInput ? searchInput.value : '');
    var year = selectedYear();
    var base = year ? genreItems.filter(function (a) { return a.year === year; }) : genreItems;
    if (q && !engine && !engineFailed) loadEngine();
    var found = matchItems(base, q);
    renderList(found);
    if (found.length) {
      if (noResults) noResults.style.display = 'none';
      showHint(null);
      return;
    }
    // Движок ещё грузится — не пугаем «ничего не найдено»: результат пересчитается, когда он будет готов
    if (q && !engine && !engineFailed) {
      showHint(null);
      if (noResults) noResults.style.display = 'none';
      counter.textContent = 'Ищем…';
      footer.hidden = false;
      moreBtn.hidden = true;
      return;
    }
    // В этом жанре нет — подсказываем раздел (только для поиска без выбранного года:
    // в другом разделе тайтл может оказаться другого года)
    var other = q.length >= 2 && !year ? matchItems(catalog.anime, q)[0] : null;
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

  // Возврат на страницу из кэша браузера (bfcache): сбрасываем поиск, год и подсказку — полный список жанра
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted || !catalog) return;
    var filtered = (searchInput && searchInput.value) || selectedYear();
    if (searchInput) searchInput.value = '';
    if (yearSelect) yearSelect.value = '';
    showHint(null);
    if (noResults) noResults.style.display = 'none';
    if (filtered) renderList(genreItems);
  });

  // Enter в поиске: если в этом жанре ничего нет, а подсказка нашла тайтл в другом разделе — сразу переходим к нему
  if (searchInput) {
    function followHint() {
      var link = hintBox && hintBox.style.display !== 'none' ? hintBox.querySelector('a') : null;
      if (!current.length && link) { location.href = link.href; return true; }
      return false;
    }
    searchInput.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || !catalog) return;
      e.preventDefault();
      clearTimeout(searchTimer);
      search(); // не ждём задержку живого поиска
      if (followHint()) return;
      // движок синонимов ещё грузится — дождёмся его и проверим подсказку ещё раз
      var q = searchInput.value;
      if (!engine && enginePromise) enginePromise.then(function () { if (searchInput.value === q) followHint(); });
    });
    // движок подгружаем заранее, как только человек собирается искать
    searchInput.addEventListener('focus', function () { if (catalog) loadEngine(); }, { once: true });
  }

  // ── Переход к тайтлу по ссылке «страница-жанра.html?anime=<id>» ──
  // (подсказки поиска в окне «Где посмотреть», постеры «Популярные аниме» на главной)
  // Догружаем порции до нужной карточки, прокручиваем к ней и подсвечиваем.
  function focusRequestedAnime() {
    var id = new URLSearchParams(location.search).get('anime');
    if (!id) return;
    var index = -1;
    for (var i = 0; i < current.length; i++) { if (current[i].id === id) { index = i; break; } }
    if (index === -1) {
      // тайтла нет в этом жанре — подсказываем раздел, где он есть
      var item = catalog.anime.filter(function (a) { return a.id === id; })[0];
      if (item) showHint(item);
      return;
    }
    while (shown <= index && shown < current.length) renderMore();
    var card = container.querySelector('.anime-item[data-anime-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
    if (!card) return;
    card.classList.add('catalog-target');
    card.setAttribute('tabindex', '-1'); // чтобы перевести на карточку фокус для читалок экрана
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function inView() {
      var r = card.getBoundingClientRect();
      return r.top >= 0 && r.top < window.innerHeight - 80;
    }
    card.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    try { card.focus({ preventScroll: true }); } catch (e) { /* старые браузеры */ }
    // Подстраховка: если плавная прокрутка не сработала (фоновая вкладка) или карточку сдвинули
    // догрузившиеся постеры — докручиваем без анимации
    setTimeout(function () { if (!inView()) card.scrollIntoView({ block: 'center' }); }, 900);
    window.addEventListener('load', function () { if (!inView()) card.scrollIntoView({ block: 'center' }); }, { once: true });
    setTimeout(function () { card.classList.remove('catalog-target'); }, 6000);
  }

  function fail(reason) {
    console.warn('Каталог не загружен, показываем карточки страницы:', reason);
    status.remove();
    staticCards.forEach(function (c) { c.hidden = false; });
    // переключатель вида и иконки кнопок — и для запасных карточек страницы
    if (!viewButtons.length) buildViewToggle();
    tagActionIcons(staticCards);
  }

  fetch(DATA_URL, { cache: 'default' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (data) {
      genreKey = detectGenre(data);
      if (!genreKey) return fail('жанр страницы не найден в каталоге');
      catalog = data;
      data.anime.forEach(function (a, i) {
        a._search = normalize([a.title, a.titleOriginal, a.titleEnglish].join(' '));
        a._order = i; // порядок каталога (популярность) — для равных по точности совпадений
      });
      genreItems = data.anime.filter(function (a) { return a.genres.indexOf(genreKey) !== -1; });
      if (!genreItems.length) return fail('в каталоге нет тайтлов этого жанра');

      staticCards.forEach(function (c) { c.remove(); });
      status.remove();
      document.body.dataset.catalogGenre = genreKey;
      buildYearFilter();
      buildGenreSwitch();
      buildViewToggle();
      // При «Назад»/«Вперёд» браузер сам подставляет в поле прежний запрос — не оставляем этот фильтр:
      // страница открывается с полным списком жанра (или сразу с нужным тайтлом по ?anime=)
      var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
      if (searchInput && nav && nav.type === 'back_forward') searchInput.value = '';
      if (searchInput && searchInput.value.trim()) search();
      else { renderList(genreItems); focusRequestedAnime(); }
    })
    .catch(function (err) { fail(err.message); });
})();
