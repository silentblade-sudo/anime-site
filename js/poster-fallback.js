/* Запасной постер: если картинка тайтла не загрузилась (файла нет, опечатка в имени, другой регистр
 * букв на хостинге), вместо битой иконки показываем img/poster-placeholder.svg.
 * Подключается в конце <body> на главной и жанровых страницах. Путь к заглушке считается
 * от адреса самого скрипта, поэтому работает и из корня сайта, и из pages/.
 */
(function () {
  'use strict';

  var scriptSrc = (document.currentScript && document.currentScript.src) || location.href;
  var PLACEHOLDER = new URL('../img/poster-placeholder.svg', scriptSrc).href;

  function useFallback(img) {
    if (img.dataset.posterFallback) return; // заглушка уже стоит — не зацикливаемся
    img.dataset.posterFallback = '1';
    img.classList.add('poster-missing');
    img.src = PLACEHOLDER;
  }

  function watch(img) {
    // Картинка могла упасть ещё до загрузки этого скрипта
    if (img.complete && img.getAttribute('src') && img.naturalWidth === 0) {
      useFallback(img);
    } else {
      img.addEventListener('error', function () { useFallback(img); });
    }
  }

  function init() {
    document.querySelectorAll('img.anime-poster, .anime-card img').forEach(watch);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
