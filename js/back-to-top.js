/* Плавающая кнопка «Наверх» (стили — css/back-to-top.css).
 *
 * Подключение в конце <body>:  <script src="../js/back-to-top.js" defer></script>
 * Кнопка создаётся скриптом, разметка на странице не нужна.
 *  - появляется после прокрутки ниже SHOW_AFTER пикселей, прячется при возврате наверх;
 *  - по клику прокручивает в начало: плавно, а при «уменьшить движение» в настройках системы — сразу;
 *  - после прокрутки переводит фокус на заголовок страницы, чтобы с клавиатуры продолжать сверху.
 */
(function () {
  'use strict';
  if (document.querySelector('.to-top-btn')) return;

  var SHOW_AFTER = 350;
  var reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'to-top-btn';
  btn.setAttribute('aria-label', 'Наверх');
  btn.title = 'Наверх';
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">' +
    '<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.5" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';
  setVisible(false);
  document.body.appendChild(btn);

  function setVisible(on) {
    btn.classList.toggle('is-visible', on);
    // спрятанная кнопка не попадает в порядок Tab и не читается экранными читалками
    btn.tabIndex = on ? 0 : -1;
    btn.setAttribute('aria-hidden', on ? 'false' : 'true');
  }

  // Проверка дешёвая (одно чтение scrollY и сравнение), поэтому выполняем её прямо в обработчике:
  // requestAnimationFrame не вызывается в фоновых вкладках и скрытых iframe, и кнопка там «залипала»
  function update() {
    var y = window.scrollY || document.documentElement.scrollTop || 0;
    var on = y > SHOW_AFTER;
    if (on !== btn.classList.contains('is-visible')) {
      // если фокус был на кнопке, а она прячется — не оставляем фокус на невидимом элементе
      if (!on && document.activeElement === btn) btn.blur();
      setVisible(on);
    }
  }
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('pageshow', update); // возврат из кэша браузера на середину страницы
  update();

  btn.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    // фокус — на главный заголовок страницы (без повторной прокрутки)
    var heading = document.querySelector('h1');
    if (heading) {
      if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
      try { heading.focus({ preventScroll: true }); } catch (e) { /* старые браузеры */ }
    }
  });
})();
