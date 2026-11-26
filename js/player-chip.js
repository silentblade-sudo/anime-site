/* Мини-карточка Игрока в шапке: «Вход» для гостей, аватар с рамкой + ник + «LV. 3 • E-ранг» для вошедших.
 *
 * Разметка на странице — любой элемент-ссылка с атрибутом data-player-chip:
 *   <a class="player-chip is-guest" data-player-chip href="login.html">Вход</a>
 * На главной так помечена прежняя кнопка «Вход» (.login-btn) — для гостей она остаётся как была.
 * Колокольчик уведомлений ставится перед карточкой. Где карточки нет — в элемент [data-notify-bell]
 * (шапка AnimeVerse), а если нет и его (игры, плеер, страница тайтла) — плавающая кнопка внизу слева.
 * Нужны js/chat-core.js (Firebase) и js/player-core.js. Сначала карточка рисуется из кэша
 * (мгновенно), затем сверяется с аккаунтом, когда страница загрузилась.
 */
(function () {
  'use strict';
  if (!window.AnimePlayer || !window.AnimeChat) return;
  var P = window.AnimePlayer;
  var ROOT = window.AnimeChat.ROOT;
  var chips = Array.prototype.slice.call(document.querySelectorAll('[data-player-chip]'));
  var mounts = Array.prototype.slice.call(document.querySelectorAll('[data-notify-bell]'));

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
      if (P.avatarFit(d.avatar) === 'contain') { img.className = 'is-contain'; av.classList.add('pf-art-full'); }
      img.src = url;
      av.appendChild(img);
    } else {
      av.textContent = (String(d.name || '?').match(/[\p{L}\p{N}]/u) || ['?'])[0].toUpperCase();
    }
    return av;
  }

  // ───────── колокольчик уведомлений рядом с карточкой (js/player-notify.js) ─────────
  var BELL_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M12 3a6 6 0 0 0-6 6v3.6L4.4 15.5A1 1 0 0 0 5.3 17h13.4a1 1 0 0 0 .9-1.5L18 12.6V9a6 6 0 0 0-6-6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9.5 19.5a2.5 2.5 0 0 0 5 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  var bells = [];
  var docListeners = false;
  function bellTargets() {
    var list = chips.map(function (a) { return { place: function (w) { a.parentNode.insertBefore(w, a); } }; });
    mounts.forEach(function (m) { list.push({ place: function (w) { m.appendChild(w); } }); });
    if (!list.length) {
      list.push({ floating: true, place: function (w) {
        var host = el('div', 'nt-float');
        host.appendChild(w);
        document.body.appendChild(host);
        return host;
      } });
    }
    return list;
  }
  function ensureBells() {
    if (!window.AnimeNotify || bells.length || !document.body) return;
    bellTargets().forEach(function (t) {
      var wrap = el('span', 'nt-bell-wrap');
      var btn = el('button', 'nt-bell');
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Уведомления');
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = BELL_SVG;
      var badge = el('span', 'nt-badge');
      badge.hidden = true;
      btn.appendChild(badge);
      // Панель живёт в <body> с position: fixed — шапки с backdrop-filter/transform создают свой слой,
      // и вложенная в них лента оказывалась ПОД карточками страницы.
      var panel = el('div', 'nt-panel nt-portal' + (t.floating ? ' nt-portal-float' : ''));
      panel.hidden = true;
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Уведомления Системы');
      var title = el('div', 'nt-panel-title', '[ УВЕДОМЛЕНИЯ СИСТЕМЫ ]');
      var box = el('div');
      panel.append(title, box);
      wrap.appendChild(btn);
      document.body.appendChild(panel);
      var host = t.place(wrap) || wrap;
      var rendered = false;
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = panel.hidden;
        document.querySelectorAll('.nt-panel').forEach(function (p) { p.hidden = true; });
        document.querySelectorAll('.nt-bell').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
        if (!open) return;
        if (!rendered) { window.AnimeNotify.render(box, { limit: 30, moreHref: ROOT + 'pages/profile.html#notifyTitle' }); rendered = true; }
        window.AnimeNotify.checkSchedule(true);
        panel.hidden = false;
        placePanel(panel, btn, t.floating);
        btn.setAttribute('aria-expanded', 'true');
      });
      panel.addEventListener('click', function (e) { e.stopPropagation(); });
      bells.push({ wrap: host, btn: btn, badge: badge, panel: panel, floating: !!t.floating });
    });
    window.AnimeNotify.onChange(updateBadges);
    updateBadges();
    if (docListeners) return;
    docListeners = true;
    document.addEventListener('click', function () {
      document.querySelectorAll('.nt-panel').forEach(function (p) { p.hidden = true; });
      document.querySelectorAll('.nt-bell').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') document.querySelectorAll('.nt-panel').forEach(function (p) { p.hidden = true; });
    });
    // открытая панель следует за колокольчиком при прокрутке и изменении размера окна
    var raf = 0;
    function follow() {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        bells.forEach(function (b) { if (!b.panel.hidden) placePanel(b.panel, b.btn, b.floating); });
      });
    }
    window.addEventListener('scroll', follow, { passive: true });
    window.addEventListener('resize', follow);
  }

  // Позиция панели у колокольчика: под ним (в шапке) или над ним (плавающий); на телефоне — CSS на всю ширину
  function placePanel(panel, btn, floating) {
    panel.style.top = panel.style.bottom = panel.style.left = '';
    if (window.matchMedia && window.matchMedia('(max-width: 600px)').matches) return;
    var r = btn.getBoundingClientRect();
    var vw = document.documentElement.clientWidth;
    var w = panel.offsetWidth || 380;
    var left = floating ? r.left : r.right + 60 - w;
    panel.style.left = Math.max(12, Math.min(left, vw - w - 12)) + 'px';
    if (floating) panel.style.bottom = Math.max(12, window.innerHeight - r.top + 10) + 'px';
    else panel.style.top = Math.max(8, r.bottom + 10) + 'px';
  }
  function updateBadges() {
    var n = window.AnimeNotify ? window.AnimeNotify.unread() : 0;
    bells.forEach(function (b) {
      b.badge.hidden = !n;
      b.badge.textContent = n > 99 ? '99+' : String(n);
      b.btn.setAttribute('aria-label', n ? 'Уведомления: непрочитанных ' + n : 'Уведомления');
    });
  }
  function removeBells() {
    bells.forEach(function (b) { b.wrap.remove(); b.panel.remove(); });
    bells = [];
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
    removeBells();
    if (window.AnimeNotify) window.AnimeNotify.detach();
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
  if (c && c.uid) {
    renderPlayer(c);
    if (window.AnimeNotify) {
      window.AnimeNotify.attachLocal(c.uid);
      if (document.body) ensureBells(); else document.addEventListener('DOMContentLoaded', ensureBells);
    }
  }

  // Число сообщений в чате (квесты «гильдии») — не чаще раза в 20 минут на вкладку
  function refreshChatQuests(uid) {
    if (!window.AnimeNotify || !P.chatCount) return;
    var k = 'animeverse_chatcount_' + uid, hit = null;
    try { hit = JSON.parse(sessionStorage.getItem(k) || 'null'); } catch (e) {}
    if (hit && Date.now() - hit.t < 20 * 60 * 1000) { window.AnimeNotify.refreshQuests({ chatCount: hit.n }); return; }
    P.chatCount(uid).then(function (n) {
      try { sessionStorage.setItem(k, JSON.stringify({ n: n, t: Date.now() })); } catch (e) {}
      window.AnimeNotify.refreshQuests({ chatCount: n });
    });
  }

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
          // лента уведомлений: события из профиля, квестов, расписания и сайта
          if (window.AnimeNotify) { window.AnimeNotify.attach(user.uid, p); ensureBells(); refreshChatQuests(user.uid); }
          try { localStorage.setItem('animeverse_player', JSON.stringify(d)); } catch (e) {}
        }).catch(function () {
          renderPlayer(P.chipData(user.uid, { username: user.displayName }, user));
          // профиль не загрузился (офлайн/правила) — лента остаётся из локального кэша
          if (window.AnimeNotify) { window.AnimeNotify.attachLocal(user.uid); ensureBells(); }
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
