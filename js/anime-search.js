/* Поиск по аниме и фильмам сайта — общий для строки поиска в шапке (js/site-search.js)
 * и окна «Где посмотреть» (js/watch-modal.js).
 *
 * Подключение: <script src="js/anime-search.js"></script> (с главной) или "../js/anime-search.js" (из pages/).
 * Если скрипт не подключён, js/watch-modal.js и js/site-search.js загрузят его сами.
 *
 * API:
 *   AnimeSearch.load()            → Promise: каталог, синонимы и фильмы загружены (один раз, лениво)
 *   AnimeSearch.find(query, opts) → [{ type: 'anime'|'movie', id, title, section, extra, href }]
 *                                   opts: { limit = 8, movies = true }
 *   AnimeSearch.scoreAll(query)   → { id: оценка } для всех подходящих аниме (меньше — точнее);
 *                                   поиск на странице жанра фильтрует по нему свой жанр
 *   AnimeSearch.normalize(text)   → строка для сравнения: нижний регистр, «ё» = «е», без знаков
 *
 * Где ищем:
 *   аниме  — title (русское), titleEnglish, titleOriginal из data/anime.json,
 *            синонимы AniList из data/anime-synonyms.json (tools/build-synonyms.mjs)
 *            и обиходные русские названия из словаря ALIASES ниже;
 *   фильмы — title, titleEn, titleOrig из js/movies-data.js.
 * Ссылки: аниме → страница его жанра с ?anime=<id> (js/catalog-page.js прокрутит к карточке),
 *         фильм → pages/content.html?id=<id>. Пути — от расположения этого скрипта, поэтому
 *         одинаково работают с главной и со страниц в pages/.
 */
(function () {
  'use strict';
  if (window.AnimeSearch) return;

  var SCRIPT_SRC = (document.currentScript && document.currentScript.src) || location.href;
  var ROOT = new URL('../', SCRIPT_SRC).href;
  var URLS = {
    catalog: new URL('../data/anime.json', SCRIPT_SRC).href,
    synonyms: new URL('../data/anime-synonyms.json', SCRIPT_SRC).href,
    movies: new URL('movies-data.js', SCRIPT_SRC).href
  };

  /* ───────── Словарь обиходных и альтернативных русских названий ─────────
   * Ключ — то, что может набрать человек; значения — строки, которые есть в английском или
   * оригинальном названии тайтла (или в его синонимах AniList). Регистр, «ё», дефисы и
   * знаки препинания не важны. Чтобы добавить название: одна строка «"как ищут": ["как в каталоге"]».
   */
  var ALIASES = {
    'ветролом': ['wind breaker'],
    'ветролом виндбрейкер': ['wind breaker'],
    'виндбрейкер': ['wind breaker'],
    'ван пис': ['one piece'],
    'большой куш': ['one piece'],
    'атака на титанов': ['shingeki no kyojin'],
    'вторжение гигантов': ['shingeki no kyojin'],
    'истребитель демонов': ['kimetsu no yaiba'],
    'клинок рассекающий демонов': ['kimetsu no yaiba'],
    'клинок демонов': ['kimetsu no yaiba'],
    'магическая битва': ['jujutsu kaisen'],
    'джуджуцу кайсен': ['jujutsu kaisen'],
    'моя геройская академия': ['boku no hero academia', 'my hero academia'],
    'моя академия героев': ['boku no hero academia', 'my hero academia'],
    'человек бензопила': ['chainsaw man'],
    'бензопила': ['chainsaw man'],
    'семья шпиона': ['spy x family'],
    'шпионская семья': ['spy x family'],
    'поднятие уровня в одиночку': ['solo leveling'],
    'соло левелинг': ['solo leveling'],
    'фрирен': ['frieren'],
    'провожающая в последний путь': ['frieren'],
    'ванпанчмен': ['one punch man'],
    'ван панч мен': ['one punch man'],
    'стальной алхимик': ['fullmetal alchemist', 'hagane no renkinjutsushi'],
    'охотник х охотник': ['hunter x hunter'],
    'хантер х хантер': ['hunter x hunter'],
    'тетрадь смерти': ['death note'],
    'токийский гуль': ['tokyo ghoul'],
    'токийские мстители': ['tokyo revengers'],
    'код гиас': ['code geass'],
    'врата штейна': ['steins gate'],
    'евангелион': ['evangelion'],
    'доктор стоун': ['dr stone'],
    'черный клевер': ['black clover'],
    'синяя тюрьма': ['blue lock'],
    'блю лок': ['blue lock'],
    'волейбол': ['haikyu'],
    'хайкью': ['haikyu'],
    'баскетбол куроко': ['kuroko no basket'],
    'сага о винланде': ['vinland saga'],
    'берсерк': ['berserk'],
    'моб психо': ['mob psycho'],
    'паразит': ['kiseijuu', 'parasyte'],
    'убийца гоблинов': ['goblin slayer'],
    'гуррен лаганн': ['gurren lagann'],
    'ковбой бибоп': ['cowboy bebop'],
    'самурай чамплу': ['samurai champloo'],
    'форма голоса': ['koe no katachi'],
    'твоя апрельская ложь': ['shigatsu wa kimi no uso'],
    'волчица и пряности': ['ookami to koushinryou', 'spice and wolf'],
    'о моем перерождении в слизь': ['tensei shitara slime'],
    'перерождение в слизь': ['tensei shitara slime'],
    'слизь': ['tensei shitara slime'],
    'реинкарнация безработного': ['mushoku tensei'],
    'жизнь с нуля': ['re zero'],
    'ре зеро': ['re zero'],
    'коносуба': ['kono subarashii'],
    'этот замечательный мир': ['kono subarashii'],
    'дандадан': ['dandadan'],
    'кайдзю номер восемь': ['kaijuu 8'],
    'кайдзю 8': ['kaijuu 8'],
    'адский рай': ['jigokuraku'],
    'магия и мускулы': ['mashle'],
    'бездомный бог': ['noragami'],
    'созданный в бездне': ['made in abyss'],
    'обещанный неверленд': ['yakusoku no neverland'],
    'обещанная страна грез': ['yakusoku no neverland'],
    'кагуя': ['kaguya sama'],
    'госпожа кагуя': ['kaguya sama'],
    'звездное дитя': ['oshi no ko'],
    'ребенок идола': ['oshi no ko'],
    'оши но ко': ['oshi no ko'],
    'одинокий рокер': ['bocchi the rock'],
    'бочи': ['bocchi the rock'],
    'монолог фармацевта': ['kusuriya no hitorigoto'],
    'аптекарша': ['kusuriya no hitorigoto'],
    'наруто ураганные хроники': ['naruto shippuden', 'naruto shippuuden'],
    'боруто': ['boruto'],
    'блич': ['bleach'],
    'джоджо': ['jojo'],
    'невероятные приключения джоджо': ['jojo'],
    'покемон': ['pokemon'],
    'клеймор': ['claymore'],
    'хеллсинг': ['hellsing'],
    'триган': ['trigun'],
    'лазурный оркестр': ['ao no orchestra'],
    'ангелы смерти': ['satsuriku no tenshi'],
    'сказка о хвосте феи': ['fairy tail'],
    'хвост феи': ['fairy tail'],
    'фейри тейл': ['fairy tail'],
    'синий экзорцист': ['ao no exorcist'],
    'необъятный океан': ['grand blue'],
    'гранд блю': ['grand blue'],
    'ночь кроличьих гонок': ['bunny girl'],
    'девушка кролик': ['bunny girl'],
    'восхождение героя щита': ['tate no yuusha'],
    'герой щита': ['tate no yuusha'],
    'мастера меча онлайн': ['sword art online'],
    'восхождение в тени': ['kage no jitsuryokusha'],
    'хочу стать сильнейшим в тени': ['kage no jitsuryokusha'],
    'теневой кардинал': ['kage no jitsuryokusha'],
    'дни сакамото': ['sakamoto days'],
    'сакамото': ['sakamoto days'],
    'инуяша': ['inuyasha'],
    'золотой камуй': ['golden kamuy'],
    'юрий на льду': ['yuri on ice'],
    'светлячки': ['hotaru no haka'],
    'поньо': ['ponyo'],
    'врата там бьются наши воины': ['gate jieitai'],
    'великий притворщик': ['great pretender'],
    'башня бога': ['tower of god'],
    'тысячелетняя кровавая война': ['sennen kessen'],
    'академия ведьмочек': ['little witch academia'],
    'маленькая академия ведьм': ['little witch academia'],
    'сао': ['sword art online'],
    'класс превосходства': ['youkoso jitsuryoku'],
    'школа превосходства': ['youkoso jitsuryoku'],
    'темный дворецкий': ['kuroshitsuji'],
    'вайолет': ['violet evergarden'],
    'ходячий замок': ['howl', 'hauru'],
    'унесенные призраками': ['spirited away', 'sen to chihiro'],
    'мой сосед тоторо': ['totoro'],
    'тоторо': ['totoro'],
    'принцесса мононоке': ['mononoke'],
    'твое имя': ['kimi no na wa'],
    'дитя погоды': ['tenki no ko'],
    'судзумэ': ['suzume'],
    'сузуме': ['suzume']
  };

  var catalog = null;        // data/anime.json после подготовки
  var movies = [];           // MOVIES из js/movies-data.js
  var aliasIndex = [];       // [{ key, targets }]
  var loadPromise = null;

  function normalize(s) {
    return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }
  function compact(s) { return s.replace(/ /g, ''); }

  function getJSON(url) {
    return fetch(url, { cache: 'default' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
      return r.json();
    });
  }

  // js/movies-data.js объявляет const MOVIES; подключаем его, только если на странице его ещё нет
  function moviesList() {
    try { return typeof MOVIES !== 'undefined' && Array.isArray(MOVIES) ? MOVIES : null; } catch (e) { return null; }
  }
  function loadMovies() {
    if (moviesList()) return Promise.resolve(moviesList());
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = URLS.movies;
      s.onload = function () { resolve(moviesList() || []); };
      s.onerror = function () { resolve([]); }; // без фильмов поиск по аниме всё равно работает
      document.head.appendChild(s);
    });
  }

  // «Свой» жанр тайтла — тот, где он стоит выше всего в списке (почти всегда первая порция страницы);
  // при равенстве — более крупный жанр («Атака титанов» → «Драма», а не «Детектив»)
  function assignGenres(data) {
    var order = Object.keys(data.genres || {});
    var rank = {};
    order.forEach(function (g) {
      var i = 0;
      data.anime.forEach(function (a) {
        if (a.genres.indexOf(g) !== -1) (rank[a.id] = rank[a.id] || {})[g] = i++;
      });
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

  function prepare(data, synonyms, movieData) {
    assignGenres(data);
    data.anime.forEach(function (a, i) {
      var names = [a.title, a.titleEnglish, a.titleOriginal].concat(synonyms[a.id] || []);
      a._title = normalize(a.title);
      a._hay = normalize(names.join(' | '));
      a._hayCompact = compact(a._hay);
      a._order = i;
    });
    movies = (movieData || []).map(function (m, i) {
      var hay = normalize([m.title, m.titleEn, m.titleOrig].join(' | '));
      return { movie: m, _title: normalize(m.title), _hay: hay, _hayCompact: compact(hay), _order: i };
    });
    aliasIndex = Object.keys(ALIASES).map(function (k) {
      return { key: normalize(k), targets: ALIASES[k].map(normalize) };
    });
    catalog = data;
  }

  function load() {
    if (!loadPromise) {
      loadPromise = Promise.all([
        getJSON(URLS.catalog),
        getJSON(URLS.synonyms).catch(function () { return {}; }), // без синонимов — по основным полям
        loadMovies()
      ]).then(function (res) {
        prepare(res[0], res[1] || {}, res[2]);
        return api;
      }).catch(function (err) {
        loadPromise = null; // следующая попытка загрузит заново
        throw err;
      });
    }
    return loadPromise;
  }

  /* Оценка совпадения: меньше — выше в списке, Infinity — не подходит.
   * -1 — название совпало с запросом целиком; 0 — название начинается с запроса;
 *  1 — с запроса начинается слово в любом названии;
   *  2 — запрос совпал со словарём ALIASES; 3 — запрос внутри названия (в т. ч. без пробелов: «ванпис») */
  function score(item, q, qCompact, aliasTargets) {
    if (item._title === q) return -1;
    if (item._title.indexOf(q) === 0) return 0;
    if ((' ' + item._hay).indexOf(' ' + q) !== -1) return 1;
    for (var i = 0; i < aliasTargets.length; i++) {
      if ((' ' + item._hay).indexOf(' ' + aliasTargets[i]) !== -1) return 2;
    }
    if (item._hay.indexOf(q) !== -1) return 3;
    if (qCompact.length >= 4 && item._hayCompact.indexOf(qCompact) !== -1) return 3;
    return Infinity;
  }

  // Словарь срабатывает, если запрос — начало ключа («ветро» → «ветролом») или ключ целиком входит в запрос
  function aliasTargetsFor(q) {
    if (q.length < 3) return [];
    var out = [];
    aliasIndex.forEach(function (a) {
      if (a.key.indexOf(q) === 0 || (' ' + a.key).indexOf(' ' + q) !== -1 || q.indexOf(a.key) === 0) {
        a.targets.forEach(function (t) { if (out.indexOf(t) === -1) out.push(t); });
      }
    });
    return out;
  }

  function find(query, opts) {
    opts = opts || {};
    var limit = opts.limit || 8;
    var q = normalize(query);
    if (!catalog || q.length < 2) return [];
    var qCompact = compact(q);
    var targets = aliasTargetsFor(q);
    var found = [];

    catalog.anime.forEach(function (a) {
      if (!a._genre) return;
      var s = score(a, q, qCompact, targets);
      if (s !== Infinity) found.push({ s: s, o: a._order, a: a });
    });
    if (opts.movies !== false) {
      movies.forEach(function (m) {
        var s = score(m, q, qCompact, targets);
        // фильмы сайта — сразу за аниме того же уровня совпадения
        if (s !== Infinity) found.push({ s: s + 0.1, o: m._order, m: m.movie });
      });
    }
    found.sort(function (x, y) { return x.s - y.s || x.o - y.o; });

    return found.slice(0, limit).map(function (f) {
      if (f.m) {
        return {
          type: 'movie',
          id: f.m.id,
          title: f.m.title,
          section: 'Фильм',
          extra: [f.m.franchise, f.m.year].filter(Boolean).join(' · '),
          href: new URL('pages/content.html', ROOT).href + '?id=' + encodeURIComponent(f.m.id)
        };
      }
      var a = f.a;
      var g = catalog.genres[a._genre];
      var extra = [];
      if (Number.isInteger(a.year)) extra.push(a.year);
      if (a.titleEnglish && normalize(a.titleEnglish) !== a._title) extra.push(a.titleEnglish);
      return {
        type: 'anime',
        id: a.id,
        title: a.title,
        section: g.name,
        extra: extra.join(' · '),
        href: new URL(g.page, ROOT).href + '?anime=' + encodeURIComponent(a.id)
      };
    });
  }

  // Оценки совпадения для всех тайтлов каталога (без ограничения количества): { id: оценка }.
  // Нужна поиску на странице жанра (js/catalog-page.js), который сам решает, какие тайтлы показывать
  // (только свой жанр и выбранный год), но ищет по тем же полям, синонимам и словарю, что и поиск по сайту.
  function scoreAll(query) {
    var q = normalize(query);
    var out = {};
    if (!catalog || !q) return out;
    var qCompact = compact(q);
    var targets = aliasTargetsFor(q);
    catalog.anime.forEach(function (a) {
      var s = score(a, q, qCompact, targets);
      if (s !== Infinity) out[a.id] = s;
    });
    return out;
  }

  var api = { load: load, find: find, scoreAll: scoreAll, normalize: normalize, aliases: ALIASES };
  window.AnimeSearch = api;
})();
