/* Избранные аниме-фильмы.
 *
 * Хранятся отдельно от избранных сериалов: localStorage["favorite_movies"] — массив id из js/movies-data.js,
 * например ["mugen-train", "your-name"]. Ключ "favorites" (названия сериалов со страниц жанров) не трогаем:
 * названия фильмов и сериалов могут совпадать («Твоё имя»), а id однозначны.
 *
 * Подключение: <script src="../js/movie-favorites.js"></script>
 * API: MovieFavorites.list() / has(id) / add(id) / remove(id) / toggle(id) → true, если фильм теперь в избранном;
 *      MovieFavorites.onChange(fn) — fn() вызывается при изменении списка в этой или другой вкладке.
 */
(function () {
  'use strict';

  var KEY = 'favorite_movies';
  var listeners = [];

  function read() {
    try {
      var list = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(list) ? list.filter(function (id) { return typeof id === 'string' && id; }) : [];
    } catch (e) {
      return []; // повреждённые данные или запрет на хранилище — считаем список пустым
    }
  }

  function write(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* приватный режим и т. п. */ }
    listeners.forEach(function (fn) { fn(); });
  }

  function has(id) { return read().indexOf(id) !== -1; }

  function add(id) {
    var list = read();
    if (id && list.indexOf(id) === -1) { list.push(id); write(list); }
  }

  function remove(id) {
    var list = read();
    var next = list.filter(function (x) { return x !== id; });
    if (next.length !== list.length) write(next);
  }

  function toggle(id) {
    if (has(id)) { remove(id); return false; }
    add(id);
    return true;
  }

  function onChange(fn) { if (typeof fn === 'function') listeners.push(fn); }

  // Изменения из другой вкладки (например, удалили фильм на странице «Избранное»)
  window.addEventListener('storage', function (e) {
    if (e.key === KEY || e.key === null) listeners.forEach(function (fn) { fn(); });
  });

  window.MovieFavorites = { key: KEY, list: read, has: has, add: add, remove: remove, toggle: toggle, onChange: onChange };
})();
