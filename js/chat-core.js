/* Общий модуль чата сообщества (виджет js/chat-widget.js и страница pages/chat.html).
 *
 * Хранилище — Firestore того же проекта, что и вход (js/firebase-config.js, pages/login.html):
 *   коллекция chat_messages, документ { text, uid, name, createdAt }.
 * Читать могут все, писать — только вошедшие (проверка здесь + правила Firestore,
 * см. firestore.chat.rules в корне проекта).
 *
 * Firebase SDK (compat 9.23.0, как на странице входа) подгружается только при первом
 * обращении к чату — обычные страницы не тяжелеют.
 *
 *   AnimeChat.ready()                         → Promise (SDK загружен и инициализирован)
 *   AnimeChat.subscribe(limit, onList, onErr, onStatus) → функция отписки
 *   AnimeChat.onUser(cb)                      → cb(user|null), user = { uid, name }
 *   AnimeChat.send(text)                      → Promise
 *   AnimeChat.signOut()                       → Promise
 *   AnimeChat.isAdmin()                       → true, если вошёл администратор (ADMIN_UIDS)
 *   AnimeChat.remove(id)                      → Promise (удаление сообщения, только администратор)
 *   AnimeChat.loginUrl()                      → адрес входа с возвратом на текущую страницу
 *   AnimeChat.MAX_LEN, AnimeChat.COOLDOWN_MS
 */
(function () {
  'use strict';
  if (window.AnimeChat) return;

  var SDK = 'https://www.gstatic.com/firebasejs/9.23.0/';
  var COLLECTION = 'chat_messages';
  var MAX_LEN = 500;
  // Администраторы чата (могут удалять любые сообщения). UID — из Firebase Console → Authentication.
  // Тот же UID прописан в правилах firestore.chat.rules: без него сервер всё равно не даст удалить.
  var ADMIN_UIDS = ['rZMCKbIfA3NZX7Nj1YiXCB4aib22'];
  var COOLDOWN_MS = 4000;

  // Корень сайта — по адресу этого скрипта (js/chat-core.js), чтобы пути работали и из корня, и из pages/
  var selfSrc = (document.currentScript && document.currentScript.src) || '';
  var ROOT = selfSrc ? new URL('../', selfSrc).href : new URL('./', location.href).href;

  var readyPromise = null;
  var db = null, auth = null;
  var currentUser = null;      // { uid, name } или null
  var userKnown = false;       // onAuthStateChanged уже ответил
  var userListeners = [];
  var lastSent = 0;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[src="' + src + '"]');
      if (existing && existing.dataset.loaded === '1') return resolve();
      var s = existing || document.createElement('script');
      s.addEventListener('load', function () { s.dataset.loaded = '1'; resolve(); }, { once: true });
      s.addEventListener('error', function () { reject(new Error('Не удалось загрузить ' + src)); }, { once: true });
      if (!existing) { s.src = src; s.async = false; document.head.appendChild(s); }
    });
  }

  // Имя для чата: имя профиля → username из users/{uid} → «Фанат аниме». Почту не показываем.
  function cleanName(n) {
    n = String(n || '').replace(/\s+/g, ' ').trim();
    return n.slice(0, 40);
  }

  // Ник для чата: никнейм из профиля игрока users/{uid}.username (меняется в pages/profile.html)
  // → имя аккаунта → «Фанат аниме». Почту не показываем.
  // Аватарка из профиля игрока (id вида avatar_xxx; проверка открытости — в js/player-core.js)
  var AVATAR_RX = /^avatar_[a-z0-9_]{1,40}$/;
  function cleanAvatar(id) { return typeof id === 'string' && AVATAR_RX.test(id) ? id : null; }

  function resolveProfile(user) {
    var direct = cleanName(user.displayName);
    return db.collection('users').doc(user.uid).get()
      .then(function (snap) {
        var data = snap.exists ? snap.data() : {};
        var avatar = window.AnimePlayer && window.AnimePlayer.currentAvatar ? window.AnimePlayer.currentAvatar(data) : cleanAvatar(data.selectedAvatar);
        return { name: cleanName(data.username) || direct || 'Фанат аниме', avatar: cleanAvatar(avatar) };
      })
      .catch(function () { return { name: direct || 'Фанат аниме', avatar: null }; });
  }

  // Ник или аватарку сменили в профиле — новые сообщения уходят уже с ними
  window.addEventListener('animeverse:player', function (e) {
    var d = e.detail || {};
    if (!currentUser || d.uid !== currentUser.uid) return;
    var name = cleanName(d.name);
    if (name) currentUser.name = name;
    if (d.avatar !== undefined) currentUser.avatar = cleanAvatar(d.avatar);
    emitUser();
  });

  function emitUser() {
    userListeners.forEach(function (cb) { try { cb(currentUser); } catch (e) { console.error(e); } });
  }

  function ready() {
    if (readyPromise) return readyPromise;
    readyPromise = (window.firebase && window.firebase.firestore && window.firebase.auth ? Promise.resolve() :
      loadScript(SDK + 'firebase-app-compat.js')
        .then(function () { return loadScript(SDK + 'firebase-auth-compat.js'); })
        .then(function () { return loadScript(SDK + 'firebase-firestore-compat.js'); }))
      .then(function () { return window.ANIME_FIREBASE_CONFIG ? null : loadScript(ROOT + 'js/firebase-config.js'); })
      .then(function () {
        var app = firebase.apps.length ? firebase.app() : firebase.initializeApp(window.ANIME_FIREBASE_CONFIG);
        db = app.firestore();
        auth = app.auth();
        auth.onAuthStateChanged(function (user) {
          if (!user) { currentUser = null; userKnown = true; emitUser(); return; }
          resolveProfile(user).then(function (prof) {
            if (!auth.currentUser || auth.currentUser.uid !== user.uid) return; // успели выйти
            currentUser = { uid: user.uid, name: prof.name, avatar: prof.avatar };
            userKnown = true;
            emitUser();
          });
        });
      })
      .catch(function (err) { readyPromise = null; throw err; });
    return readyPromise;
  }

  // Лента: последние limit сообщений по времени; onStatus('online' | 'offline' | 'connecting')
  function subscribe(limit, onList, onError, onStatus) {
    var unsub = null, stopped = false;
    if (onStatus) onStatus('connecting');
    ready().then(function () {
      if (stopped) return;
      unsub = db.collection(COLLECTION).orderBy('createdAt', 'desc').limit(limit || 50)
        .onSnapshot({ includeMetadataChanges: true }, function (snap) {
          var list = [];
          snap.forEach(function (doc) {
            var d = doc.data({ serverTimestamps: 'estimate' }) || {};
            if (typeof d.text !== 'string') return;
            var ts = d.createdAt && d.createdAt.toDate ? d.createdAt.toDate() : new Date();
            list.push({ id: doc.id, text: d.text, uid: d.uid || '', name: cleanName(d.name) || 'Фанат аниме', avatar: cleanAvatar(d.avatar), at: ts, pending: doc.metadata.hasPendingWrites });
          });
          list.reverse();
          if (onStatus) onStatus(snap.metadata.fromCache && !navigator.onLine ? 'offline' : 'online');
          onList(list);
        }, function (err) {
          if (onStatus) onStatus('offline');
          if (onError) onError(err);
        });
    }).catch(function (err) {
      if (onStatus) onStatus('offline');
      if (onError) onError(err);
    });
    return function () { stopped = true; if (unsub) unsub(); };
  }

  function onUser(cb) {
    userListeners.push(cb);
    if (userKnown) cb(currentUser);
    ready().catch(function () { cb(null); });
    return function () { userListeners = userListeners.filter(function (f) { return f !== cb; }); };
  }

  function send(raw) {
    var text = String(raw || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
    if (!text) return Promise.reject(new Error('empty'));
    if (text.length > MAX_LEN) return Promise.reject(new Error('too-long'));
    if (!currentUser || !auth || !auth.currentUser) return Promise.reject(new Error('auth'));
    var wait = lastSent + COOLDOWN_MS - Date.now();
    if (wait > 0) { var e = new Error('cooldown'); e.wait = wait; return Promise.reject(e); }
    lastSent = Date.now();
    var msg = {
      text: text,
      uid: auth.currentUser.uid,
      name: currentUser.name,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    var avatar = cleanAvatar(currentUser.avatar);
    if (avatar) msg.avatar = avatar;
    return db.collection(COLLECTION).add(msg).catch(function (err) {
      // старые правила (без поля avatar) отклоняют такое сообщение — отправляем без аватарки
      if (avatar && err && err.code === 'permission-denied') {
        delete msg.avatar;
        return db.collection(COLLECTION).add(msg);
      }
      throw err;
    }).catch(function (err) { lastSent = 0; throw err; });
  }

  function isAdmin() {
    return !!(currentUser && auth && auth.currentUser && ADMIN_UIDS.indexOf(auth.currentUser.uid) !== -1);
  }

  function remove(id) {
    if (!isAdmin()) return Promise.reject(new Error('not-admin'));
    return db.collection(COLLECTION).doc(String(id)).delete();
  }

  function signOut() { return ready().then(function () { return auth.signOut(); }); }

  function loginUrl() {
    return ROOT + 'pages/login.html?returnUrl=' + encodeURIComponent(location.pathname + location.search + location.hash);
  }

  // Понятный текст ошибки для интерфейса
  function errorText(err) {
    var code = err && (err.code || err.message) || '';
    if (code === 'not-admin') return 'Удалять сообщения может только администратор.';
    if (code === 'permission-denied' || code === 'firestore/permission-denied') return 'Нет доступа к чату: правила базы пока не разрешают это действие.';
    if (code === 'auth') return 'Войдите в аккаунт, чтобы писать в чат.';
    if (code === 'too-long') return 'Сообщение длиннее ' + MAX_LEN + ' символов.';
    if (code === 'empty') return 'Сообщение пустое.';
    if (code === 'cooldown') return 'Не так быстро: подождите ' + Math.ceil((err.wait || COOLDOWN_MS) / 1000) + ' с.';
    if (code === 'unavailable' || !navigator.onLine) return 'Нет связи с сервером. Проверьте интернет.';
    if (/загрузить/.test(code)) return 'Не удалось загрузить чат. Проверьте интернет и обновите страницу.';
    return 'Не удалось выполнить действие. Попробуйте ещё раз.';
  }

  // Время: «14:05», для прошлых дней — «12 нояб., 14:05»
  function formatTime(date) {
    var now = new Date();
    var sameDay = date.toDateString() === now.toDateString();
    var t = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return sameDay ? t : date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ', ' + t;
  }

  function formatDay(date) {
    var now = new Date();
    var y = new Date(now); y.setDate(now.getDate() - 1);
    if (date.toDateString() === now.toDateString()) return 'Сегодня';
    if (date.toDateString() === y.toDateString()) return 'Вчера';
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  }

  // Вывод ленты в контейнер: разделители дней, своё сообщение подсвечено. Только textContent — без HTML.
  // Автопрокрутка вниз, если пользователь и так был внизу (или это первая отрисовка).
  function render(box, list, opts) {
    opts = opts || {};
    var nearBottom = !box.dataset.rendered || box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    var me = currentUser && currentUser.uid;
    var admin = isAdmin();
    var frag = document.createDocumentFragment();
    var lastDay = '';
    if (!list.length) {
      var empty = document.createElement('p');
      empty.className = 'chat-empty';
      empty.textContent = opts.emptyText || 'Сообщений пока нет — начните разговор первым!';
      frag.appendChild(empty);
    }
    list.forEach(function (m) {
      var day = m.at.toDateString();
      if (opts.days && day !== lastDay) {
        var sep = document.createElement('div');
        sep.className = 'chat-day';
        sep.textContent = formatDay(m.at);
        frag.appendChild(sep);
      }
      lastDay = day;
      var item = document.createElement('div');
      item.className = 'chat-msg' + (me && m.uid === me ? ' is-own' : '') + (m.pending ? ' is-pending' : '');
      var head = document.createElement('div');
      head.className = 'chat-msg-head';
      var name = document.createElement('span');
      name.className = 'chat-msg-name';
      name.textContent = m.name;
      var time = document.createElement('time');
      time.className = 'chat-msg-time';
      time.dateTime = m.at.toISOString();
      time.textContent = m.pending ? 'отправляется…' : formatTime(m.at);
      // мини-аватарка автора: картинка из img/avatars/ или буква ника
      var ava = document.createElement('span');
      ava.className = 'chat-msg-ava';
      var url = m.avatar && m.avatar !== 'avatar_initial' && window.AnimePlayer ? window.AnimePlayer.avatarUrl(m.avatar) : null;
      if (url) {
        var img = new Image();
        img.alt = '';
        img.loading = 'lazy';
        img.src = url;
        ava.appendChild(img);
      } else {
        ava.textContent = (String(m.name).match(/[\p{L}\p{N}]/u) || ['?'])[0].toUpperCase();
      }
      head.append(ava, name, time);
      // Кнопка удаления — только у администратора; гостям и обычным пользователям не создаётся вовсе
      if (admin && !m.pending) {
        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'chat-msg-del';
        del.title = 'Удалить сообщение';
        del.setAttribute('aria-label', 'Удалить сообщение от ' + m.name);
        del.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path d="M5 7h14M10 11v6M14 11v6M6.5 7l1 12.5h9L17.5 7M9.5 7V4.5h5V7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        del.addEventListener('click', makeDeleteHandler(m, item, del, opts));
        head.appendChild(del);
      }
      var text = document.createElement('p');
      text.className = 'chat-msg-text';
      text.textContent = m.text;
      item.append(head, text);
      frag.appendChild(item);
    });
    box.replaceChildren(frag);
    box.dataset.rendered = '1';
    if (nearBottom || opts.forceBottom) box.scrollTop = box.scrollHeight;
  }

  // Подтверждение и удаление; ошибку показываем через opts.onError (или alert, если его нет)
  function makeDeleteHandler(m, item, btn, opts) {
    return function () {
      var preview = m.text.length > 80 ? m.text.slice(0, 80) + '…' : m.text;
      if (!window.confirm('Удалить это сообщение?\n\n' + m.name + ': ' + preview)) return;
      btn.disabled = true;
      item.classList.add('is-deleting');
      remove(m.id).catch(function (err) {
        btn.disabled = false;
        item.classList.remove('is-deleting');
        var code = err && (err.code || err.message);
        var text = code === 'permission-denied'
          ? 'Сервер отклонил удаление: в правилах Firestore нет прав администратора для этого аккаунта.'
          : errorText(err);
        if (opts && typeof opts.onError === 'function') opts.onError(text); else window.alert(text);
      });
    };
  }

  window.AnimeChat = {
    render: render,
    isAdmin: isAdmin,
    remove: remove,
    ready: ready,
    subscribe: subscribe,
    onUser: onUser,
    send: send,
    signOut: signOut,
    loginUrl: loginUrl,
    errorText: errorText,
    formatTime: formatTime,
    formatDay: formatDay,
    currentUser: function () { return currentUser; },
    // общий Firebase для других модулей сайта (профиль игрока, мини-карточка в шапке)
    services: function () { return ready().then(function () { return { db: db, auth: auth, firebase: window.firebase }; }); },
    ROOT: ROOT,
    MAX_LEN: MAX_LEN,
    COOLDOWN_MS: COOLDOWN_MS
  };
})();
