/**
 * Таблица соответствия: жанр сайта → жанры/теги AniList.
 *
 * Как дополнять: добавьте объект в массив GENRE_MAP.
 *   key     — латинский идентификатор жанра на сайте (попадёт в поле genres у тайтлов);
 *   name    — название на сайте;
 *   group   — раздел меню на главной (Сёнэн, Сёдзё, ...);
 *   page    — страница жанра в pages/;
 *   sources — откуда брать тайтлы, по порядку. Если первого источника не хватает
 *             до нужного количества, сборщик берёт следующий.
 *             { genre: '...' } — жанр AniList (точное имя из GenreCollection);
 *             { tag: '...' }   — тег AniList (точное имя из MediaTagCollection).
 *
 * Тайтл попадает в раздел сайта, если у него есть хотя бы один жанр или тег из sources
 * этого раздела. Поэтому одно аниме может оказаться сразу в нескольких разделах, а в
 * итоговом JSON при этом хранится один раз. Перед загрузкой сборщик сверяет имена
 * жанров и тегов с AniList и предупредит об опечатке.
 *
 * Список жанров AniList: Action, Adventure, Comedy, Drama, Ecchi, Fantasy, Horror,
 * Mahou Shoujo, Mecha, Music, Mystery, Psychological, Romance, Sci-Fi, Slice of Life,
 * Sports, Supernatural, Thriller. Тегов — несколько сотен (см. https://anilist.co/search/anime).
 */
export const GENRE_MAP = [
  // ── Сёнэн ─────────────────────────────────────────────────────────────
  { key: 'martial-arts',  name: 'Боевые искусства',   group: 'Сёнэн',      page: 'boevye-iskusstva.html',
    sources: [{ tag: 'Martial Arts' }] },
  { key: 'adventure',     name: 'Приключения',        group: 'Сёнэн',      page: 'priklyucheniya.html',
    sources: [{ genre: 'Adventure' }] },
  { key: 'sci-fi',        name: 'Фантастика',         group: 'Сёнэн',      page: 'fantastika.html',
    sources: [{ genre: 'Sci-Fi' }] },
  { key: 'supernatural',  name: 'Сверхъестественное', group: 'Сёнэн',      page: 'sverhestestvennoe.html',
    sources: [{ genre: 'Supernatural' }] },

  // ── Сёдзё ─────────────────────────────────────────────────────────────
  { key: 'romance',       name: 'Романтика',          group: 'Сёдзё',      page: 'syojo-romantika.html',
    sources: [{ genre: 'Romance' }] },
  { key: 'school',        name: 'Школа',              group: 'Сёдзё',      page: 'syojo-shkola.html',
    sources: [{ tag: 'School' }, { tag: 'School Club' }] },
  { key: 'music',         name: 'Музыка',             group: 'Сёдзё',      page: 'syojo-muzyka.html',
    sources: [{ genre: 'Music' }] },

  // ── Сэйнэн ────────────────────────────────────────────────────────────
  { key: 'psychological', name: 'Психология',         group: 'Сэйнэн',     page: 'psihologiya.html',
    sources: [{ genre: 'Psychological' }] },
  { key: 'horror',        name: 'Ужасы',              group: 'Сэйнэн',     page: 'uzhasy.html',
    sources: [{ genre: 'Horror' }] },
  { key: 'detective',     name: 'Детектив',           group: 'Сэйнэн',     page: 'detektiv.html',
    sources: [{ tag: 'Detective' }, { genre: 'Mystery' }] },

  // ── Дзёсэй ────────────────────────────────────────────────────────────
  { key: 'drama',         name: 'Драма',              group: 'Дзёсэй',     page: 'drama.html',
    sources: [{ genre: 'Drama' }] },
  { key: 'slice-of-life', name: 'Повседневность',     group: 'Дзёсэй',     page: 'povsednevnost.html',
    sources: [{ genre: 'Slice of Life' }] },
  // В AniList нет жанра «реализм» — ближе всего аниме для взрослой женской аудитории (дзёсэй).
  // Тег «Primarily Adult Cast» пробовали: он слишком широкий (туда попадает даже One Piece).
  { key: 'realism',       name: 'Реализм',            group: 'Дзёсэй',     page: 'realizm.html',
    sources: [{ tag: 'Josei' }] },

  // ── Кодомомукэ ────────────────────────────────────────────────────────
  // Обучающих аниме в каталоге мало — добираем детскими (тег Kids)
  { key: 'educational',   name: 'Обучающее',          group: 'Кодомомукэ', page: 'obuchayushchee.html',
    sources: [{ tag: 'Educational' }, { tag: 'Kids' }] },
  { key: 'fantasy',       name: 'Фэнтези',            group: 'Кодомомукэ', page: 'fantasy-kids.html',
    sources: [{ genre: 'Fantasy' }] },
  { key: 'animals',       name: 'Животные',           group: 'Кодомомукэ', page: 'zhivotnye.html',
    sources: [{ tag: 'Animals' }, { tag: 'Anthropomorphism' }] },
];

/** Минимальный «вес» тега AniList (0–100), чтобы считать тайтл относящимся к разделу.
 *  70 — тема действительно важна для тайтла (при 60 в «Животные» попадал One Piece с весом 64). */
export const MIN_TAG_RANK = 70;
