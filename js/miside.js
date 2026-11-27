/* Раздел MiSide: ссылки Steam, активный пункт меню, просмотр артов, фильтр галереи.
 *
 * ★ ССЫЛКА НА АККАУНТ STEAM — ЗДЕСЬ, В ОДНОМ МЕСТЕ ★
 *   Вставьте адрес профиля, например:
 *     'https://steamcommunity.com/id/ваш_id/'
 *     'https://steamcommunity.com/profiles/7656119XXXXXXXXXX/'
 *   Пока строка пустая, кнопки «Аккаунт в Steam» скрыты, а остаётся «MiSide в Steam» (страница игры).
 */
(function () {
  'use strict';

  var STEAM_ACCOUNT_URL = '';
  var STEAM_GAME_URL = 'https://store.steampowered.com/app/2527500/MiSide/';

  function validSteam(url) {
    return /^https:\/\/(steamcommunity\.com\/(id|profiles)\/[^\s/?#]+\/?|store\.steampowered\.com\/)/i.test(url || '');
  }

  // ── Steam: [data-steam="account"] — профиль; [data-steam="game"] — страница игры ──
  document.querySelectorAll('[data-steam]').forEach(function (a) {
    var kind = a.getAttribute('data-steam');
    var url = kind === 'account' ? STEAM_ACCOUNT_URL : STEAM_GAME_URL;
    if (!validSteam(url)) { a.hidden = true; return; }
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.hidden = false;
  });

  // ── активный пункт меню ──
  var page = location.pathname.split('/').pop() || 'page.html';
  document.querySelectorAll('.ms-nav a').forEach(function (a) {
    if ((a.getAttribute('href') || '').split('#')[0] === page) a.setAttribute('aria-current', 'page');
  });

  // ── просмотр арта: любой элемент с data-full ──
  var dlg = null, dlgImg, dlgCap;
  function ensureDialog() {
    if (dlg) return;
    dlg = document.createElement('dialog');
    dlg.className = 'ms-lightbox';
    dlg.setAttribute('aria-label', 'Просмотр изображения');
    dlgImg = document.createElement('img');
    dlgImg.alt = '';
    var bar = document.createElement('div');
    bar.className = 'ms-lightbox-bar';
    dlgCap = document.createElement('span');
    dlgCap.className = 'ms-lightbox-cap';
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'ms-lightbox-close';
    close.setAttribute('aria-label', 'Закрыть');
    close.textContent = '×';
    close.addEventListener('click', function () { dlg.close(); });
    bar.append(dlgCap, close);
    dlg.append(dlgImg, bar);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    document.body.appendChild(dlg);
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-full]');
    if (!t) return;
    e.preventDefault();
    ensureDialog();
    var img = t.querySelector('img');
    dlgImg.src = t.getAttribute('data-full');
    dlgImg.alt = img ? img.alt : '';
    dlgCap.textContent = t.getAttribute('data-caption') || (img ? img.alt : '');
    if (typeof dlg.showModal === 'function') dlg.showModal(); else window.open(dlgImg.src, '_blank', 'noopener');
  });

  // ── фильтр галереи ──
  var filter = document.querySelector('.ms-filter');
  if (filter) {
    filter.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-filter]');
      if (!b) return;
      var f = b.getAttribute('data-filter');
      filter.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      document.querySelectorAll('.ms-gallery [data-kind]').forEach(function (it) {
        it.hidden = f !== 'all' && it.getAttribute('data-kind') !== f;
      });
    });
  }
})();
