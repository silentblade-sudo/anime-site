/* Мини-карточка Игрока в шапке: «Вход» для гостей, аватар с рамкой + ник + «LV. 3 • E-ранг» для вошедших.
 *
 * Разметка на странице — любой элемент-ссылка с атрибутом data-player-chip:
 *   <a class="player-chip is-guest" data-player-chip href="login.html">Вход</a>
 * На главной так помечена прежняя кнопка «Вход» (.login-btn) — для гостей она остаётся как была.
 * Нужны js/chat-core.js (Firebase) и js/player-core.js. Сначала карточка рисуется из кэша
 * (мгновенно), затем сверяется с аккаунтом, когда страница загрузилась.
 */
(function () {
  'use strict';
  if (!window.AnimePlayer || !window.AnimeChat) return;
  var P = window.AnimePlayer;
  var ROOT = window.AnimeChat.ROOT;
  var chips = Array.prototype.slice.call(document.querySelectorAll('[data-player-chip]'));
  if (!chips.length) return;

  chips.forEach(function (a) { if (!a.dataset.guestHtml) a.dataset.guestHtml = a.innerHTML; });

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  // Аватар: выбранная аватарка из img/avatars/ внутри выбранной рамки; буква — только для «Инициала»
  function avatar(d, size) {
    var av = el('span', 'pf-avatar pf-' + (d.frame || 'frame_common').replace('_', '-') + (size ? ' pf-avatar-' + size : ''));
    var url = d.avatar && d.avatar !== 'avatar_initial' ? P.avatarUrl(d.avatar) : null;
    if (url) {
      var img = new Image();
      img.alt = '';
      img.decoding = 'async';
      if (P.avatarFit(d.avatar) === 'contain') img.className = 'is-contain';
      img.src = url;
      av.appendChild(img);
    } else {
      av.textContent = (String(d.name || '?').match(/[\p{L}\p{N}]/u) || ['?'])[0].toUpperCase();
    }
    return av;
  }

  function renderPlayer(d) {
    chips.forEach(function (a) {
      a.classList.remove('is-guest');
      a.classList.add('player-chip', 'is-player');
      a.href = ROOT + 'pages/profile.html';
      a.setAttribute('aria-label', 'Профиль Игрока ' + d.name + ', уровень ' + d.level);
      a.title = 'Профиль Игрока';
      var text = el('span', 'player-chip-text');
      text.append(el('b', 'player-chip-name', d.name), el('small', 'player-chip-lv', 'LV. ' + d.level + ' • ' + (d.rank === 'Монарх' ? 'Монарх' : d.rank + '-ранг')));
      a.replaceChildren(avatar(d), text);
    });
  }

  function renderGuest() {
    chips.forEach(function (a) {
      a.classList.remove('is-player');
      if (!a.classList.contains('login-btn')) a.classList.add('is-guest');
      a.innerHTML = a.dataset.guestHtml;
      a.href = ROOT + 'pages/login.html?returnUrl=' + encodeURIComponent(location.pathname + location.search);
      a.removeAttribute('title');
      a.setAttribute('aria-label', 'Вход и регистрация');
    });
  }

  // 1) мгновенно — из кэша
  var c = P.cached();
  if (c && c.uid) renderPlayer(c);

  // 2) обновления из профиля на этой же или другой вкладке
  window.addEventListener('animeverse:player', function (e) { if (e.detail && e.detail.uid) renderPlayer(e.detail); });
  window.addEventListener('storage', function (e) {
    if (e.key !== 'animeverse_player') return;
    var d = P.cached();
    if (d && d.uid) renderPlayer(d); else renderGuest();
  });

  // 3) сверка с аккаунтом — после загрузки страницы, чтобы не тормозить её
  function verify() {
    P.services().then(function (s) {
      s.auth.onAuthStateChanged(function (user) {
        if (!user) { P.setViewer(null); P.clearCache(); renderGuest(); return; }
        P.setViewer(user.uid);
        P.load(user.uid).then(function (p) {
          var d = P.chipData(user.uid, p, user);
          renderPlayer(d);
          try { localStorage.setItem('animeverse_player', JSON.stringify(d)); } catch (e) {}
        }).catch(function () {
          renderPlayer(P.chipData(user.uid, { username: user.displayName }, user));
        });
      });
    }).catch(function () { /* без сети карточка остаётся из кэша */ });
  }
  function later() {
    if ('requestIdleCallback' in window) requestIdleCallback(verify, { timeout: 3000 });
    else setTimeout(verify, 1200);
  }
  if (document.readyState === 'complete') later(); else window.addEventListener('load', later);
})();
