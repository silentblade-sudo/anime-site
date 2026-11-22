/* Каталог pages/movies.html: вкладки «Фильмы» и «Аниме».
 *
 *   «Фильмы» — полнометражные фильмы сайта из js/movies-data.js (карточка → pages/content.html?id=…);
 *   «Аниме»  — сериалы из data/anime.json (всё, кроме формата MOVIE); карточка → pages/content.html?anime=<id>.
 *
 * Адрес: movies.html?tab=anime открывает вкладку «Аниме»; movies.html?tab=anime&anime=<id> — ещё и
 * докручивает до тайтла и подсвечивает его (так ведут постеры и названия на страницах жанров).
 * Поиск (с синонимами из js/anime-search.js, если он подключён), фильтр франшиз, счётчик и
 * «Показать ещё» работают внутри выбранной вкладки.
 */
(function () {
  'use strict';

  var PAGE_SIZE = 24;
  var PLACEHOLDER = '../img/poster-placeholder.svg';
  var DATA_URL = '../data/anime.json';
  var FORMAT_LABELS = { TV: 'ТВ-сериал', TV_SHORT: 'Короткий ТВ', OVA: 'OVA', ONA: 'ONA', SPECIAL: 'Спешл', MUSIC: 'Клип', MOVIE: 'Фильм' };
  var SERIES_FAV_KEY = 'favorites';                  // избранные сериалы (названия) — как на страницах жанров
  var SERIES_META_KEY = 'animeverse_favorites_meta';  // постеры для страницы «Избранное»

  var grid = document.getElementById('moviesGrid');
  var searchInput = document.getElementById('movieSearch');
  var franchiseSelect = document.getElementById('franchiseFilter');
  var counter = document.getElementById('resultsCounter');
  var tabButtons = Array.prototype.slice.call(document.querySelectorAll('.tab-btn'));
  var moreBox = document.getElementById('catalogMore');
  var moreBtn = document.getElementById('catalogMoreBtn');
  var viewButtons = Array.prototype.slice.call(document.querySelectorAll('.view-btn'));

  var MOVIE_LIST = typeof MOVIES !== 'undefined' && Array.isArray(MOVIES) ? MOVIES : [];
  var movieItems = MOVIE_LIST.map(function (m, i) {
    return {
      kind: 'movie', id: m.id, title: m.title, year: m.year, poster: m.poster,
      franchise: m.franchise || '', franchiseKey: m.franchise || '',
      meta: [m.franchise, m.year].filter(Boolean).join(' • '),
      search: [m.title, m.titleEn, m.titleOrig].join(' | '),
      href: 'content.html?id=' + encodeURIComponent(m.id),
      desc: Array.isArray(m.description) ? m.description[0] : (m.description || ''),
      order: i
    };
  });
  var animeItems = null;   // строится при первом открытии вкладки «Аниме»
  var animeLoading = null;

  var state = { tab: 'movies', shown: 0, list: [] };
  var searchTimer = null;

  // ───────── помощники ─────────
  var normalize = function (t) { return String(t || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); };
  function plural(n, one, few, many) {
    var n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
    return many;
  }
  function posterSrc(poster) {
    if (!poster) return PLACEHOLDER;
    return /^(https?:)?\/\//.test(poster) || poster.charAt(0) === '/' ? poster : '../' + poster;
  }
  function readJSON(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v; } catch (e) { return fallback; }
  }

  // ───────── данные аниме ─────────
  // Франшиза аниме — общая часть названия: «Атака титанов», «Атака титанов 2», «Атака Титанов: Финал» → одна.
  // Ключ считаем по английскому (или оригинальному) названию — оно единообразнее русского.
  function franchiseKey(a) {
    var t = String(a.titleEnglish || a.titleOriginal || a.title || '').toLowerCase();
    t = t.split(/:\s|\s[-–—]\s/)[0];
    t = t.replace(/\s*\(.*?\)\s*/g, ' ')
      .replace(/\s+(the\s+)?(final\s+)?(season|part|cour|movie|ova|specials?|recap)\b.*$/, '')
      .replace(/\s+(\d+(st|nd|rd|th)?|[ivx]+)$/, '')
      .replace(/[^\p{L}\p{N};]+/gu, ' ').trim();
    return t;
  }
  function franchiseName(a) {
    var t = String(a.title || '').split(/:\s|\s[-–—]\s/)[0];
    return t.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+(\d+|[IVX]+)$/, '').replace(/\s+(сезон|часть)\b.*$/i, '').trim() || a.title;
  }

  // Русские названия франшиз, у которых в data/anime.json нет русского названия ни у одного тайтла
  // (или есть только название отдельного сезона). Ключ — franchiseKey() основной франшизы.
  var FRANCHISE_RU = {
    'aggretsuko': 'Агрессивная Рэцуко',
    'bang dream': 'Бандори!',
    'bungo stray dogs': 'Великий из бродячих псов',
    'chihayafuru': 'Яркая Тихая',
    'danganronpa': 'Данганронпа',
    'diabolik lovers': 'Дьявольские возлюбленные',
    'dragon ball': 'Драконий жемчуг',            // в данных главным оказывается сезон «Драконий жемчуг Зет»
    'food wars': 'Повар-боец Сома',
    'haikyu': 'Волейбол!!',
    'honey and clover': 'Мёд и клевер',
    'is it wrong to try to pick up girls in a dungeon': 'Может, я встречу тебя в подземелье?',
    'k on': 'Кэйон!',
    'link click': 'Агент времени',
    'macross': 'Макросс',
    'mushoku tensei': 'Реинкарнация безработного',
    'my teen romantic comedy snafu': 'Розовая пора моей школьной жизни сплошной обман',
    'nodame cantabile': 'Нодамэ Кантабиле',
    'overlord': 'Повелитель',
    'ranma1 2': 'Ранма ½',
    're zero starting life in another world': 'Re:Zero. Жизнь с нуля в другом мире',
    'sound euphonium': 'Звучи, эуфониум!'
  };
  // Короткие ключи, к которым НЕ присоединяем длинные: «Blood+» — не та же франшиза,
  // что «Blood Blockade Battlefront» и «Blood-C»
  var NO_MERGE = { 'blood': 1 };
  var hasCyrillic = function (t) { return /[а-яё]/i.test(String(t || '')); };

  // Раздел (жанр), куда ведёт карточка аниме: где тайтл стоит выше всего; при равенстве — более крупный жанр
  function assignGenres(data) {
    var order = Object.keys(data.genres || {});
    var rank = {};
    order.forEach(function (g) {
      var i = 0;
      data.anime.forEach(function (a) { if (a.genres.indexOf(g) !== -1) (rank[a.id] = rank[a.id] || {})[g] = i++; });
    });
    data.anime.forEach(function (a) {
      var best = null, bestRank = Infinity;
      order.forEach(function (g) {
        var r = rank[a.id] && rank[a.id][g];
        if (r === undefined) return;
        var bigger = best && (data.genres[g].count || 0) > (data.genres[best].count || 0);
        if (r < bestRank || (r === bestRank && bigger)) { best = g; bestRank = r; }
      });
      a._genre = best;
    });
  }

  function loadAnime() {
    if (animeItems) return Promise.resolve(animeItems);
    if (!animeLoading) {
      animeLoading = fetch(DATA_URL, { cache: 'default' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (data) {
          assignGenres(data);
          var series = data.anime.filter(function (a) { return a.format !== 'MOVIE'; });
          // продолжения с подзаголовком без двоеточия («Dr. STONE NEW WORLD») — в основную франшизу («Dr. STONE»)
          var keyOf = {}, seen = {};
          series.forEach(function (a) { keyOf[a.id] = franchiseKey(a); seen[keyOf[a.id]] = 1; });
          var allKeys = Object.keys(seen).sort(function (x, y) { return x.length - y.length; });
          var merged = {};
          allKeys.forEach(function (k) {
            var base = allKeys.filter(function (o) { return o.length >= 5 && !NO_MERGE[o] && o !== k && k.indexOf(o + ' ') === 0; })[0];
            merged[k] = base ? (merged[base] || base) : k;
          });
          // Имя франшизы (каталог отсортирован по популярности):
          //   1) русский словарь FRANCHISE_RU — для франшиз без русского названия в данных;
          //   2) русское название самого популярного тайтла группы, где оно есть;
          //   3) иначе — название самого популярного тайтла как есть.
          var names = {}, ruNames = {};
          series.forEach(function (a) {
            var k = merged[keyOf[a.id]];
            if (!k) return;
            var n = franchiseName(a);
            if (!names[k]) names[k] = n;
            if (!ruNames[k] && hasCyrillic(n)) ruNames[k] = n;
          });
          Object.keys(names).forEach(function (k) { names[k] = FRANCHISE_RU[k] || ruNames[k] || names[k]; });
          animeItems = series.map(function (a, i) {
            var g = a._genre && data.genres[a._genre];
            var key = merged[keyOf[a.id]];
            return {
              kind: 'anime', id: a.id, title: a.title, year: a.year, poster: a.poster,
              franchise: names[key] || '', franchiseKey: key,
              meta: [FORMAT_LABELS[a.format], a.year, g && g.name].filter(Boolean).join(' • '),
              search: [a.title, a.titleEnglish, a.titleOriginal, names[key]].join(' | '),
              href: 'content.html?anime=' + encodeURIComponent(a.id), // страница содержания (pages/content.html)
              titleOriginal: a.titleOriginal || null,
              desc: a.synopsis || '',
              order: i
            };
          });
          return animeItems;
        })
        .catch(function (err) { animeLoading = null; throw err; });
    }
    return animeLoading;
  }

  function items() { return state.tab === 'anime' ? (animeItems || []) : movieItems; }

  // ───────── фильтр франшиз (свой для каждой вкладки) ─────────
  function fillFranchises() {
    var list = items();
    var counts = {}, names = {};
    list.forEach(function (it) {
      if (!it.franchiseKey) return;
      counts[it.franchiseKey] = (counts[it.franchiseKey] || 0) + 1;
      names[it.franchiseKey] = names[it.franchiseKey] || it.franchise;
    });
    // у аниме в списке только франшизы от 3 тайтлов — иначе сотни пунктов из одиночных сериалов
    var min = state.tab === 'anime' ? 3 : 1;
    var keys = Object.keys(counts).filter(function (k) { return counts[k] >= min; })
      .sort(function (a, b) { return names[a].localeCompare(names[b], 'ru'); });
    franchiseSelect.replaceChildren();
    var all = document.createElement('option');
    all.value = '';
    all.textContent = 'Все франшизы';
    franchiseSelect.appendChild(all);
    keys.forEach(function (k) {
      var o = document.createElement('option');
      o.value = k;
      o.textContent = names[k] + ' (' + counts[k] + ')';
      franchiseSelect.appendChild(o);
    });
  }

  // ───────── избранное ─────────
  function seriesFavs() { var f = readJSON(SERIES_FAV_KEY, []); return Array.isArray(f) ? f : []; }
  function isFav(it) {
    if (it.kind === 'movie') return !!(window.MovieFavorites && MovieFavorites.has(it.id));
    return seriesFavs().indexOf(it.title) !== -1;
  }
  function toggleFav(it) {
    if (it.kind === 'movie') { if (window.MovieFavorites) MovieFavorites.toggle(it.id); return; }
    var favs = seriesFavs();
    var i = favs.indexOf(it.title);
    if (i === -1) {
      favs.push(it.title);
      // постер для страницы «Избранное» — как это делают страницы жанров
      var meta = readJSON(SERIES_META_KEY, {}) || {};
      meta[it.title] = { poster: it.poster, id: it.id, titleOriginal: it.titleOriginal };
      try { localStorage.setItem(SERIES_META_KEY, JSON.stringify(meta)); } catch (e) {}
    } else favs.splice(i, 1);
    try { localStorage.setItem(SERIES_FAV_KEY, JSON.stringify(favs)); } catch (e) {}
    syncAllFavButtons();
  }
  function syncFavButton(btn, it) {
    var inFav = isFav(it);
    btn.textContent = inFav ? '★' : '☆';
    btn.setAttribute('aria-pressed', String(inFav));
    var action = inFav ? 'Убрать из избранного' : 'Добавить в избранное';
    btn.title = action;
    btn.setAttribute('aria-label', action + ': «' + it.title + '»');
  }
  function syncAllFavButtons() {
    grid.querySelectorAll('.card-fav').forEach(function (b) { if (b._item) syncFavButton(b, b._item); });
  }

  // ───────── карточки ─────────
  function createCard(it) {
    var card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = it.id;

    var link = document.createElement('a');
    link.className = 'card-link';
    link.href = it.href;

    var posterBox = document.createElement('div');
    posterBox.className = 'card-poster';
    var img = document.createElement('img');
    img.src = posterSrc(it.poster);
    img.alt = it.poster ? 'Постер: ' + it.title : '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', function () { img.src = PLACEHOLDER; img.alt = ''; }, { once: true });
    posterBox.appendChild(img);

    var body = document.createElement('div');
    body.className = 'card-body';
    var title = document.createElement('h2');
    title.className = 'card-title';
    title.textContent = it.title;
    var meta = document.createElement('span');
    meta.className = 'card-meta';
    meta.textContent = it.meta;
    body.append(title, meta);
    // описание видно только в режиме «Список» (в сетке скрыто стилями)
    if (it.desc) {
      var desc = document.createElement('p');
      desc.className = 'card-desc';
      desc.textContent = it.desc;
      body.appendChild(desc);
    }

    link.append(posterBox, body);
    card.appendChild(link);

    if (it.kind === 'anime' || window.MovieFavorites) {
      var fav = document.createElement('button');
      fav.type = 'button';
      fav.className = 'card-fav';
      fav._item = it;
      fav.addEventListener('click', function () { toggleFav(it); syncFavButton(fav, it); });
      syncFavButton(fav, it);
      card.appendChild(fav);
    }
    return card;
  }

  // ───────── вывод, счётчик, «Показать ещё» ─────────
  function updateCounter() {
    var total = items().length;
    var filtered = normalize(searchInput.value) || franchiseSelect.value;
    var noun = state.tab === 'anime' ? 'аниме' : plural(total, 'фильм', 'фильма', 'фильмов');
    if (filtered) {
      counter.textContent = 'Найдено: ' + state.list.length + ' из ' + total +
        (state.list.length > state.shown ? ' · показано ' + state.shown : '');
    } else {
      counter.textContent = total + ' ' + noun + (state.list.length > state.shown ? ' · показано ' + state.shown : '');
    }
    var left = state.list.length - state.shown;
    moreBox.hidden = left <= 0;
    moreBtn.textContent = 'Показать ещё ' + Math.min(PAGE_SIZE, left);
  }

  function renderMore() {
    var batch = state.list.slice(state.shown, state.shown + PAGE_SIZE);
    batch.forEach(function (it) { grid.appendChild(createCard(it)); });
    state.shown += batch.length;
    updateCounter();
  }

  function render(list) {
    state.list = list;
    state.shown = 0;
    grid.replaceChildren();
    if (!list.length) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      var text = document.createElement('p');
      text.textContent = items().length ? 'Ничего не найдено' : (state.tab === 'anime' ? 'Список аниме пока пуст' : 'Список фильмов пока пуст');
      empty.appendChild(text);
      if (items().length) {
        var reset = document.createElement('button');
        reset.type = 'button';
        reset.className = 'btn-reset';
        reset.textContent = 'Сбросить фильтры';
        reset.addEventListener('click', resetFilters);
        empty.appendChild(reset);
      }
      grid.appendChild(empty);
      updateCounter();
      return;
    }
    renderMore();
  }

  // Поиск: с движком js/anime-search.js — ещё и по синонимам и обиходным названиям («ветролом»),
  // сначала точные совпадения; без него — по русскому, английскому и оригинальному названию
  var engine = null;
  if (window.AnimeSearch) {
    window.AnimeSearch.load().then(function (api) {
      engine = api;
      if (normalize(searchInput.value)) filterItems();
    }).catch(function () { /* без движка поиск работает по основным названиям */ });
  }

  function filterItems() {
    var query = normalize(searchInput.value);
    var franchise = franchiseSelect.value;
    var list = items().filter(function (it) { return !franchise || it.franchiseKey === franchise; });
    if (query) {
      var scores = engine && state.tab === 'anime' ? engine.scoreAll(query) : null;
      if (scores) {
        // тайтлы, найденные движком (по названиям и синонимам), — первыми; затем совпавшие
        // только по русскому названию франшизы
        var byEngine = list.filter(function (it) { return scores[it.id] !== undefined; })
          .sort(function (a, b) { return scores[a.id] - scores[b.id] || a.order - b.order; });
        var byFranchise = list.filter(function (it) {
          return scores[it.id] === undefined && it.franchise && normalize(it.franchise).indexOf(query) !== -1;
        });
        list = byEngine.concat(byFranchise);
      } else {
        list = list.filter(function (it) { return normalize(it.search).indexOf(query) !== -1; });
      }
    }
    render(list);
  }

  function resetFilters() {
    searchInput.value = '';
    franchiseSelect.value = '';
    filterItems();
    searchInput.focus();
  }

  // ───────── вкладки ─────────
  function syncTabs() {
    tabButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tab === state.tab)); });
    searchInput.placeholder = state.tab === 'anime' ? 'Название аниме…' : 'Введите название...';
    document.title = state.tab === 'anime' ? 'Каталог: аниме — Anime Fan Club' : 'Каталог: фильмы — Anime Fan Club';
  }

  function showStatus(text) {
    var p = document.createElement('div');
    p.className = 'empty-state';
    p.textContent = text;
    grid.replaceChildren(p);
    counter.textContent = '';
    moreBox.hidden = true;
  }

  // Открыть вкладку; focusId — тайтл, к которому докрутить и подсветить
  function openTab(tab, opts) {
    opts = opts || {};
    state.tab = tab === 'anime' ? 'anime' : 'movies';
    syncTabs();
    if (opts.updateUrl) {
      var url = new URL(location.href);
      url.searchParams.set('tab', state.tab);
      url.searchParams.delete('anime');
      history.replaceState(null, '', url.pathname + url.search);
    }
    if (state.tab === 'movies') {
      fillFranchises();
      filterItems();
      return;
    }
    if (!animeItems) showStatus('Загружаем каталог аниме…');
    loadAnime().then(function () {
      if (state.tab !== 'anime') return; // пока грузили, переключились обратно
      fillFranchises();
      filterItems();
      if (opts.focusId) focusItem(opts.focusId);
    }).catch(function () {
      if (state.tab === 'anime') showStatus('Не удалось загрузить каталог аниме. Проверьте подключение и обновите страницу.');
    });
  }

  // Докрутить «Показать ещё» до нужного тайтла, прокрутить к нему и подсветить
  function focusItem(id) {
    var index = -1;
    for (var i = 0; i < state.list.length; i++) { if (state.list[i].id === id) { index = i; break; } }
    if (index === -1) return;
    while (state.shown <= index && state.shown < state.list.length) renderMore();
    var card = grid.querySelector('.card[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
    if (!card) return;
    card.classList.add('is-target');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    card.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    var link = card.querySelector('.card-link');
    try { link.focus({ preventScroll: true }); } catch (e) {}
    setTimeout(function () {
      var r = card.getBoundingClientRect();
      if (r.top < 0 || r.top > window.innerHeight - 80) card.scrollIntoView({ block: 'center' });
    }, 900);
    setTimeout(function () { card.classList.remove('is-target'); }, 6000);
  }

  // ───────── вид: «Сетка» (по умолчанию) / «Список» ─────────
  // Ключ общий со страницами жанров (js/catalog-page.js) — выбор один на весь сайт
  var VIEW_KEY = 'animeverse_catalog_view';
  function savedView() {
    try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'; } catch (e) { return 'grid'; }
  }
  function applyView(mode) {
    var list = mode === 'list';
    // без анимаций на время перестройки — иначе hover-переходы карточек «дёргаются»
    document.body.classList.add('view-switching');
    grid.classList.toggle('is-list', list);
    viewButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.view === (list ? 'list' : 'grid'))); });
    void grid.offsetWidth;
    document.body.classList.remove('view-switching');
  }
  viewButtons.forEach(function (b) {
    b.addEventListener('click', function () {
      try { localStorage.setItem(VIEW_KEY, b.dataset.view); } catch (e) { /* приватный режим */ }
      applyView(b.dataset.view);
    });
  });
  // сменили вид на другой вкладке браузера — подхватываем
  window.addEventListener('storage', function (e) { if (e.key === VIEW_KEY) applyView(savedView()); });
  applyView(savedView());

  // ───────── события ─────────
  searchInput.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(filterItems, state.tab === 'anime' ? 150 : 0);
  });
  franchiseSelect.addEventListener('change', filterItems);
  moreBtn.addEventListener('click', renderMore);
  tabButtons.forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.tab === state.tab) return;
      searchInput.value = '';
      openTab(b.dataset.tab, { updateUrl: true });
    });
  });
  // избранное фильмов изменилось (здесь, на странице фильма или в другой вкладке) — обновляем звёздочки
  if (window.MovieFavorites) MovieFavorites.onChange(syncAllFavButtons);
  window.addEventListener('storage', function (e) { if (e.key === SERIES_FAV_KEY) syncAllFavButtons(); });

  // ───────── запуск: вкладка и тайтл из адреса ─────────
  var params = new URLSearchParams(location.search);
  var focusId = params.get('anime');
  openTab(params.get('tab') === 'anime' || focusId ? 'anime' : 'movies', { focusId: focusId });
})();
