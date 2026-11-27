/* Площадки для окна «▶ Смотреть» (js/watch-modal.js).
 *
 * Как дополнять: одна строка — одна площадка.
 *   group — раздел в окне (площадки группируются в порядке первого появления группы);
 *   name  — название кнопки;
 *   url   — адрес поиска, {q} заменяется на название тайтла (уже закодированное для URL);
 *   query — какое название подставлять:
 *             'ru'   — русское (если его нет — английское, потом оригинальное);
 *             'en'   — английское (если нет — оригинальное, потом русское);
 *             'orig' — оригинальное латиницей (если нет — английское, потом русское);
 *   suffix — необязательное слово, которое добавляется к названию в запросе (например, «аниме»);
 *   note   — короткая пометка мелким шрифтом (доступность, подписка).
 *
 * Адреса проверены 19.11.2026 (VK Видео — 27.11.2026): поиск по ссылке подставляет запрос и показывает результаты.
 * Не подошли (запрос из адреса игнорируется или сайт недоступен): IVI, KION, PREMIER, START,
 * HIDIVE, Wink (из части регионов открывается страница блокировки).
 */
window.WATCH_PLATFORMS = [
  // Российские онлайн-кинотеатры
  { group: 'Онлайн-кинотеатры', name: 'Кинопоиск', url: 'https://www.kinopoisk.ru/index.php?kp_query={q}', query: 'ru' },
  { group: 'Онлайн-кинотеатры', name: 'Okko',      url: 'https://okko.tv/search/{q}',                     query: 'ru' },

  // Официальные бесплатные каналы правообладателей, общий поиск YouTube и VK Видео
  { group: 'Бесплатно: YouTube и VK Видео', name: 'Muse Asia',     url: 'https://www.youtube.com/@MuseAsia/search?query={q}',   query: 'en', note: 'официально' },
  { group: 'Бесплатно: YouTube и VK Видео', name: 'Ani-One Asia',  url: 'https://www.youtube.com/@AniOneAsia/search?query={q}', query: 'en', note: 'официально' },
  { group: 'Бесплатно: YouTube и VK Видео', name: 'Поиск YouTube', url: 'https://www.youtube.com/results?search_query={q}',     query: 'ru', suffix: 'аниме' },
  // VK Видео: поиск по адресу vkvideo.ru/search?q= (проверено 27.11.2026 — запрос подставляется в поле, выдача по тайтлу)
  { group: 'Бесплатно: YouTube и VK Видео', name: 'VK Видео',      url: 'https://vkvideo.ru/search?q={q}',                      query: 'ru', suffix: 'аниме', note: 'бесплатно' },

  // Зарубежные стриминги
  { group: 'Зарубежные стриминги', name: 'Crunchyroll', url: 'https://www.crunchyroll.com/search?q={q}',       query: 'en', note: 'не во всех странах' },
  { group: 'Зарубежные стриминги', name: 'Bstation',    url: 'https://www.bilibili.tv/en/search-result?q={q}', query: 'en', note: 'бесплатно' },
  { group: 'Зарубежные стриминги', name: 'Prime Video', url: 'https://www.primevideo.com/search?phrase={q}',   query: 'en', note: 'подписка' },
  { group: 'Зарубежные стриминги', name: 'Netflix',     url: 'https://www.netflix.com/search?q={q}',           query: 'en', note: 'подписка, не в РФ' },

  // Каталоги: описание, рейтинги, где смотреть
  { group: 'Каталоги и сообщества', name: 'Шикимори',    url: 'https://shikimori.io/animes?search={q}',            query: 'ru' },
  { group: 'Каталоги и сообщества', name: 'MyAnimeList', url: 'https://myanimelist.net/anime.php?cat=anime&q={q}', query: 'orig' },
  { group: 'Каталоги и сообщества', name: 'AniList',     url: 'https://anilist.co/search/anime?search={q}',        query: 'orig' },

  // Поисковики — пользователь сам выберет площадку
  { group: 'Поиск', name: 'Яндекс', url: 'https://yandex.ru/search/?text={q}',      query: 'ru', suffix: 'аниме смотреть' },
  { group: 'Поиск', name: 'Google', url: 'https://www.google.com/search?q={q}',     query: 'ru', suffix: 'аниме смотреть' },
];
