/* Плавающий виджет чата сообщества (правый нижний угол). Стили — css/chat.css, данные — js/chat-core.js.
 *
 * Подключение (после js/chat-core.js):
 *   <link rel="stylesheet" href="../css/chat.css">
 *   <script src="../js/chat-core.js" defer></script>
 *   <script src="../js/chat-widget.js" defer></script>
 *
 * Firebase загружается только при первом открытии окна. На pages/chat.html виджет не показывается.
 */
(function () {
  'use strict';
  if (!window.AnimeChat || document.querySelector('.chat-fab')) return;
  if (/\/chat\.html$/i.test(location.pathname) || document.body.hasAttribute('data-no-chat-widget')) return;

  var Chat = window.AnimeChat;
  var LIMIT = 40;
  var ICON_CHAT = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 8.5h8M8 12h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  var ICON_EXPAND = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_CLOSE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M4 12 20 4l-6 16-2.5-6.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  // ── Кнопка ──
  var fab = el('button', 'chat-fab');
  fab.type = 'button';
  fab.setAttribute('aria-expanded', 'false');
  fab.setAttribute('aria-controls', 'chatPanel');
  fab.setAttribute('aria-label', 'Чат сообщества');
  fab.innerHTML = ICON_CHAT + '<span class="chat-fab-label">Чат</span>';

  // ── Окно ──
  var panel = el('section', 'chat-panel');
  panel.id = 'chatPanel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Чат сообщества');

  var head = el('div', 'chat-panel-head');
  var title = el('div', 'chat-panel-title');
  title.appendChild(el('b', '', 'Чат сообщества'));
  var status = el('span', 'chat-status', 'Подключаемся…');
  status.dataset.state = 'connecting';
  title.appendChild(status);
  var full = el('a', 'chat-icon-btn');
  full.href = Chat.ROOT + 'pages/chat.html';
  full.title = 'Открыть на весь экран';
  full.setAttribute('aria-label', 'Открыть чат на весь экран');
  full.innerHTML = ICON_EXPAND;
  var close = el('button', 'chat-icon-btn');
  close.type = 'button';
  close.title = 'Свернуть';
  close.setAttribute('aria-label', 'Свернуть чат');
  close.innerHTML = ICON_CLOSE;
  head.append(title, full, close);

  var list = el('div', 'chat-list');
  list.setAttribute('role', 'log');
  list.setAttribute('aria-live', 'polite');
  list.appendChild(el('p', 'chat-note', 'Загружаем сообщения…'));

  var foot = el('div', 'chat-panel-foot');
  // гость
  var guest = el('div', 'chat-guest');
  guest.appendChild(el('span', '', 'Писать в чат могут только зарегистрированные пользователи'));
  var loginBtn = el('a', 'chat-btn', 'Войти / Регистрация');
  guest.appendChild(loginBtn);
  // вошедший
  var form = el('form', 'chat-form');
  form.hidden = true;
  var userRow = el('div', 'chat-panel-user');
  var who = el('span');
  who.append('Вы: ');
  var whoName = el('b');
  who.appendChild(whoName);
  var counter = el('span', '', '0/' + Chat.MAX_LEN);
  userRow.append(who, counter);
  var row = el('div', 'chat-form-row');
  var input = el('textarea', 'chat-input');
  input.rows = 1;
  input.maxLength = Chat.MAX_LEN;
  input.placeholder = 'Сообщение… (Enter — отправить)';
  input.setAttribute('aria-label', 'Сообщение в чат');
  var sendBtn = el('button', 'chat-btn');
  sendBtn.type = 'submit';
  sendBtn.setAttribute('aria-label', 'Отправить');
  sendBtn.innerHTML = ICON_SEND;
  row.append(input, sendBtn);
  var err = el('div', 'chat-form-meta chat-form-error');
  err.setAttribute('aria-live', 'polite');
  form.append(userRow, row, err);
  foot.append(guest, form);

  panel.append(head, list, foot);
  document.body.append(panel, fab);
  document.body.classList.add('has-chat-widget');

  // ── Логика ──
  var unsubscribe = null;
  var lastList = [];
  // ошибка удаления (только у администратора) — под полем ввода
  var renderOpts = { days: false, onError: function (text) { err.textContent = text; } };

  function setStatus(state) {
    status.dataset.state = state;
    status.textContent = state === 'online' ? 'В сети' : state === 'offline' ? 'Нет соединения' : 'Подключаемся…';
  }

  function start() {
    if (unsubscribe) return;
    loginBtn.href = Chat.loginUrl();
    unsubscribe = Chat.subscribe(LIMIT, function (msgs) {
      lastList = msgs;
      Chat.render(list, msgs, renderOpts);
    }, function (e) {
      var p = el('p', 'chat-note is-error', Chat.errorText(e));
      list.replaceChildren(p);
    }, setStatus);
    Chat.onUser(function (user) {
      guest.hidden = !!user;
      form.hidden = !user;
      whoName.textContent = user ? user.name : '';
      if (lastList.length) Chat.render(list, lastList, renderOpts); // пересчитать «свои» сообщения
    });
  }

  function open() {
    panel.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    start();
    list.scrollTop = list.scrollHeight;
    if (!form.hidden) input.focus({ preventScroll: true });
  }

  function hide() {
    panel.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
  }

  fab.addEventListener('click', function () { panel.hidden ? open() : hide(); });
  close.addEventListener('click', function () { hide(); fab.focus(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !panel.hidden) { hide(); fab.focus(); }
  });

  function autosize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 140) + 'px';
    counter.textContent = input.value.length + '/' + Chat.MAX_LEN;
  }
  input.addEventListener('input', function () { autosize(); err.textContent = ''; });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sendBtn.disabled) return;
    sendBtn.disabled = true;
    Chat.send(input.value).then(function () {
      input.value = '';
      autosize();
      list.scrollTop = list.scrollHeight;
    }).catch(function (e2) {
      err.textContent = Chat.errorText(e2);
    }).then(function () {
      setTimeout(function () { sendBtn.disabled = false; }, 600);
    });
  });
})();
