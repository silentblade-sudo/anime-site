/* Терминал Системы — pages/profile.html.
 * Механики и хранение — js/player-core.js (AnimePlayer), Firebase — js/chat-core.js (AnimeChat).
 * Все пользовательские тексты выводятся через textContent.
 */
(function () {
  'use strict';
  var P = window.AnimePlayer;
  var Chat = window.AnimeChat;
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  var services = null, user = null, player = null, chatCount = 0;
  var invFilter = 'all';
  var busy = false;

  // ───────── вывод ─────────
  function toast(text) {
    var t = $('sysToast');
    t.textContent = '[ СИСТЕМА ] ' + text;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.hidden = true; }, 3200);
  }

  function frameClass(id) { return 'pf-' + String(id || 'frame_common').replace('_', '-'); }
  function initial(name) { return (String(name || '?').match(/[\p{L}\p{N}]/u) || ['?'])[0].toUpperCase(); }

  // Аватар: картинка выбранной аватарки внутри рамки; буква — только у «Инициала»
  // keepFrame — показать рамку даже у арта «целиком» (превью рамок); иначе такой арт занимает место рамки
  function avatarNode(avatarId, frame, keepFrame) {
    var node = el('span', 'pf-avatar ' + frameClass(frame));
    fillAvatar(node, avatarId, keepFrame);
    return node;
  }
  function fillAvatar(node, avatarId, keepFrame) {
    // «Алая луна» — арт целиком и крупно, до внешнего ободка, без кольца рамки вокруг
    node.classList.toggle('pf-art-full', !keepFrame && P.avatarFit(avatarId) === 'contain');
    var url = avatarId && avatarId !== 'avatar_initial' ? P.avatarUrl(avatarId) : null;
    if (url) {
      var img = new Image();
      img.alt = '';
      img.decoding = 'async';
      if (P.avatarFit(avatarId) === 'contain') img.className = 'is-contain'; // арт целиком, без обрезки
      img.src = url;
      node.replaceChildren(img);
    } else {
      node.textContent = initial(player && player.username);
    }
  }
  function setAvatar(node, frame, avatarId) {
    node.className = node.className.replace(/\bpf-frame-[a-z]+\b/g, '').trim() + ' ' + frameClass(frame);
    fillAvatar(node, avatarId);
  }

  function unlockedSet() { var s = {}; P.computeUnlocked(player).forEach(function (id) { s[id] = 1; }); return s; }
  function selectedFrame() { return P.currentFrame(player); }
  function selectedTitle() { return P.currentTitle(player); }
  function selectedAvatar() { return P.currentAvatar(player); }

  function renderStatus() {
    var info = P.levelInfo(player.exp);
    var rank = P.rankFor(info.level);
    var name = player.username || 'Игрок';
    var title = selectedTitle();
    $('welcomeText').textContent = 'Добро пожаловать, Игрок ' + name + '.';
    $('pName').textContent = name;
    $('pTitle').textContent = title ? '«' + P.REWARDS[title].name + '»' : 'Без звания — заслужите первое в квестах Системы';
    $('pLevel').textContent = info.level;
    $('pRank').textContent = rank.name;
    $('pRank').dataset.rank = rank.id;
    $('expText').textContent = info.into + ' / ' + info.need + ' EXP · всего ' + info.total;
    $('expFill').style.width = Math.round(info.into / info.need * 100) + '%';
    $('expBar').setAttribute('aria-valuemax', info.need);
    $('expBar').setAttribute('aria-valuenow', info.into);
    setAvatar($('bigAvatar'), selectedFrame(), selectedAvatar());
    $('stCollection').textContent = P.collectionCount(player);
    $('stWatched').textContent = (player.watched || []).length;
    $('stChat').textContent = chatCount >= 10 ? '10+' : chatCount;
    var streak = player.lastDailyClaim === P.todayKey() || player.lastDailyClaim === P.yesterdayKey() ? (player.dailyStreak || 0) : 0;
    $('stStreak').textContent = streak;
  }

  var RARITY_ORDER = { common: 0, rare: 1, epic: 2, legendary: 3 };
  var avatarCat = 'all';

  function renderSettings() {
    var nick = $('nickInput');
    if (document.activeElement !== nick) nick.value = player.username || '';
    var u = unlockedSet();

    // аватарки: открытые первыми, дальше по редкости
    var avs = $('avatarsList');
    avs.replaceChildren();
    P.visibleRewardIds().filter(function (id) {
      var r = P.REWARDS[id];
      return r.type === 'avatar' && (avatarCat === 'all' || r.cat === avatarCat || (avatarCat !== 'all' && r.cat === 'special'));
    }).sort(function (a, b) {
      return (P.REWARDS[b].exclusive ? 1 : 0) - (P.REWARDS[a].exclusive ? 1 : 0) // личная — первой
        || (u[b] ? 1 : 0) - (u[a] ? 1 : 0) || RARITY_ORDER[P.REWARDS[a].rarity] - RARITY_ORDER[P.REWARDS[b].rarity];
    }).forEach(function (id) {
      var r = P.REWARDS[id];
      var b = el('button', 'av-opt');
      b.type = 'button';
      b.dataset.avatar = id;
      b.disabled = !u[id];
      b.setAttribute('aria-pressed', String(selectedAvatar() === id));
      b.title = u[id] ? r.desc : 'Заблокировано: ' + P.rewardSource(id);
      b.setAttribute('aria-label', r.name + (u[id] ? '' : ' — заблокировано: ' + P.rewardSource(id)));
      b.append(avatarNode(id, 'frame_common'), el('span', 'av-rarity rarity-' + r.rarity, { common: 'обычная', rare: 'редкая', epic: 'эпическая', legendary: 'легендарная' }[r.rarity]), el('span', null, u[id] ? r.name : P.rewardSource(id)));
      avs.appendChild(b);
    });

    // звания: только заслуженные можно надеть, закрытые — с условием получения
    var tl = $('titlesList');
    tl.replaceChildren();
    var current = selectedTitle();
    var any = false;
    P.visibleRewardIds().filter(function (id) { return P.REWARDS[id].type === 'title'; })
      .sort(function (a, b) { return (u[b] ? 1 : 0) - (u[a] ? 1 : 0); })
      .forEach(function (id) {
        var r = P.REWARDS[id];
        if (u[id]) any = true;
        var b = el('button', 'title-opt');
        b.type = 'button';
        b.dataset.title = id;
        b.disabled = !u[id];
        b.setAttribute('aria-pressed', String(current === id));
        b.append(el('b', null, r.icon + ' ' + r.name), el('small', null, u[id] ? r.desc : 'Как получить: ' + P.rewardSource(id)));
        tl.appendChild(b);
      });
    if (!any) tl.prepend(el('p', 'title-none', 'Пока нет ни одного звания. Выполните «Первое пробуждение» — и Система выдаст первое.'));

    // рамки: превью с текущей аватаркой
    var frames = $('framesList');
    frames.replaceChildren();
    P.visibleRewardIds().forEach(function (id) {
      var r = P.REWARDS[id];
      if (r.type !== 'frame') return;
      var b = el('button', 'frame-opt');
      b.type = 'button';
      b.dataset.frame = id;
      b.disabled = !u[id];
      b.setAttribute('aria-pressed', String(selectedFrame() === id));
      b.title = u[id] ? r.desc : 'Заблокировано: ' + P.rewardSource(id);
      b.append(avatarNode(selectedAvatar(), id, true), el('span', null, r.name));
      frames.appendChild(b);
    });
  }

  function rewardNames(ids) { return (ids || []).map(function (id) { var r = P.REWARDS[id]; return r ? (r.type === 'avatar' ? '🖼️ аватар «' + r.name + '»' : r.icon + ' ' + r.name) : id; }).join(', '); }

  function questItem(st) {
    var q = st.quest;
    var li = el('li', 'quest' + (st.claimed ? ' is-claimed' : st.done ? ' is-ready' : ''));
    var info = el('div');
    info.append(el('div', 'quest-title', q.title), el('div', 'quest-desc', q.desc));
    var reward = '+' + (q.daily ? dailyExp() : q.exp) + ' EXP' + (q.rewards ? ' · ' + rewardNames(q.rewards) : '');
    info.appendChild(el('div', 'quest-reward', 'Награда: ' + reward));
    li.appendChild(info);
    if (st.claimed) {
      li.appendChild(el('span', 'quest-done-mark', q.daily ? '✔ ЗАВТРА СНОВА' : '✔ ВЫПОЛНЕНО'));
    } else {
      var btn = el('button', 'sys-btn quest-claim' + (st.done ? ' primary' : ''), st.done ? 'Забрать награду' : 'В процессе');
      btn.type = 'button';
      btn.disabled = !st.done;
      btn.addEventListener('click', function () { claim(q); });
      li.appendChild(btn);
    }
    if (!q.daily) {
      var prog = el('div', 'quest-progress');
      var bar = el('div', 'exp-bar');
      var fill = el('div', 'exp-fill');
      fill.style.width = Math.round(st.value / q.target * 100) + '%';
      bar.appendChild(fill);
      prog.append(bar, el('span', null, st.value + ' / ' + q.target));
      li.appendChild(prog);
    }
    return li;
  }

  function renderQuests() {
    var states = P.questStates(player, { chatCount: chatCount });
    var daily = $('dailyList'), story = $('questList');
    daily.replaceChildren();
    story.replaceChildren();
    // сначала готовые к получению, затем в процессе, в конце выполненные
    var order = function (s) { return s.claimed ? 2 : s.done ? 0 : 1; };
    states.filter(function (s) { return s.quest.daily; }).forEach(function (s) { daily.appendChild(questItem(s)); });
    states.filter(function (s) { return !s.quest.daily; })
      .sort(function (a, b) { return order(a) - order(b); })
      .forEach(function (s) { story.appendChild(questItem(s)); });
  }

  function renderWatched() {
    var list = $('watchedList');
    list.replaceChildren();
    (player.watched || []).forEach(function (w) {
      var li = el('li', 'watched-item');
      li.appendChild(el('span', null, w.title));
      var x = el('button', null, '×');
      x.type = 'button';
      x.setAttribute('aria-label', 'Убрать «' + w.title + '» из журнала');
      x.addEventListener('click', function () { removeWatched(w); });
      li.appendChild(x);
      list.appendChild(li);
    });
    if (!(player.watched || []).length) list.appendChild(el('li', 'sys-text', 'Журнал пуст — отметьте первый просмотренный тайтл.'));
  }

  var TYPE_NAMES = { frame: 'РАМКА', title: 'ЗВАНИЕ', artifact: 'АРТЕФАКТ', avatar: 'АВАТАР' };
  var RARITY_NAMES = { common: 'обычн.', rare: 'редк.', epic: 'эпич.', legendary: 'легенд.' };

  function renderInventory() {
    var u = unlockedSet();
    var list = $('inventoryList');
    list.replaceChildren();
    var ids = P.visibleRewardIds().filter(function (id) { return invFilter === 'all' || P.REWARDS[id].type === invFilter; });
    // открытые — первыми
    ids.sort(function (a, b) { return (u[b] ? 1 : 0) - (u[a] ? 1 : 0); });
    ids.forEach(function (id) {
      var r = P.REWARDS[id];
      var li = el('li', 'item rarity-' + r.rarity + (u[id] ? '' : ' is-locked'));
      var icon = el('span', 'item-icon');
      if (r.type === 'frame') icon.appendChild(avatarNode(selectedAvatar(), id, true));
      else if (r.type === 'avatar') icon.appendChild(avatarNode(id, 'frame_common'));
      else icon.textContent = r.icon;
      li.append(icon, el('span', 'item-type', TYPE_NAMES[r.type] + ' · ' + RARITY_NAMES[r.rarity]), el('span', 'item-name', r.name), el('span', 'item-desc', r.desc));
      li.appendChild(el('span', 'item-src', (u[id] ? 'Получено: ' : 'Как получить: ') + (P.rewardSource(id) || 'с самого начала')));
      list.appendChild(li);
    });
    var total = P.visibleRewardIds().length;
    $('invSummary').textContent = 'Открыто наград: ' + Object.keys(u).length + ' из ' + total + '.';
  }

  function renderAll() {
    renderStatus();
    renderSettings();
    renderQuests();
    renderWatched();
    renderInventory();
  }

  function publishChip() {
    P.publish(P.chipData(user.uid, player, user));
  }

  // ───────── действия ─────────
  function dailyExp() {
    var streak = player.lastDailyClaim === P.yesterdayKey() ? (player.dailyStreak || 0) + 1 : 1;
    return 50 + 10 * (Math.min(streak, 7) - 1);
  }

  function claim(q) {
    if (busy || !player || !user) return;
    var st = P.questStates(player, { chatCount: chatCount }).filter(function (s) { return s.quest.id === q.id; })[0];
    if (!st || !st.done || st.claimed) return;
    busy = true;
    var before = P.levelInfo(player.exp).level;
    var unlockedBefore = unlockedSet();
    var patch = {};
    var gained = q.daily ? dailyExp() : q.exp;
    if (q.daily) {
      patch.dailyStreak = player.lastDailyClaim === P.yesterdayKey() ? (player.dailyStreak || 0) + 1 : 1;
      patch.dailyTotal = (player.dailyTotal || 0) + 1;
      patch.lastDailyClaim = P.todayKey();
    } else {
      var claimed = Object.assign({}, player.claimedQuests || {});
      claimed[q.id] = new Date().toISOString();
      patch.claimedQuests = claimed;
    }
    patch.exp = (player.exp || 0) + gained;
    var next = Object.assign({}, player, patch);
    patch.level = P.levelInfo(patch.exp).level;
    patch.unlockedRewards = P.computeUnlocked(next);
    // новое звание Система надевает сама (последнее из полученных)
    var newTitles = patch.unlockedRewards.filter(function (id) { return !unlockedBefore[id] && P.REWARDS[id].type === 'title'; });
    if (newTitles.length) patch.selectedTitle = newTitles[newTitles.length - 1];
    P.save(user.uid, patch).then(function () {
      Object.assign(player, patch);
      var fresh = patch.unlockedRewards.filter(function (id) { return !unlockedBefore[id]; });
      renderAll();
      publishChip();
      showReward(q, gained, before, patch.level, fresh);
    }).catch(function (err) {
      toast('Не удалось сохранить прогресс: ' + (err && err.code === 'permission-denied' ? 'нет доступа к профилю в базе.' : 'проверьте подключение.'));
    }).then(function () { busy = false; });
  }

  function showReward(q, exp, before, after, fresh) {
    var levelUp = after > before;
    $('levelBar').textContent = levelUp ? '[ УВЕДОМЛЕНИЕ СИСТЕМЫ ]' : '[ КВЕСТ ВЫПОЛНЕН ]';
    $('levelTitle').textContent = levelUp ? 'LEVEL UP!' : q.title;
    $('levelSub').textContent = levelUp ? 'LV. ' + before + ' → LV. ' + after + ' · ' + P.rankFor(after).name : 'Награда получена';
    var list = $('levelList');
    list.replaceChildren(el('li', null, '⚡ +' + exp + ' EXP за «' + q.title + '»'));
    fresh.forEach(function (id) {
      var r = P.REWARDS[id];
      var li = el('li');
      if (r.type === 'avatar') li.appendChild(avatarNode(id, 'frame_crimson'));
      else if (r.type === 'frame') li.appendChild(avatarNode(selectedAvatar(), id, true));
      li.appendChild(el('span', null, (r.type === 'avatar' || r.type === 'frame' ? '' : r.icon + ' ') + 'Новая награда: ' + r.name + ' (' + TYPE_NAMES[r.type].toLowerCase() + ')' + (r.type === 'title' && player.selectedTitle === id ? ' — надето' : '')));
      list.appendChild(li);
    });
    if (levelUp && P.rankFor(after).id !== P.rankFor(before).id) list.appendChild(el('li', null, '🏅 Новый ранг: ' + P.rankFor(after).name));
    var d = $('levelDialog');
    if (typeof d.showModal === 'function') d.showModal(); else toast(levelUp ? 'LEVEL UP! LV. ' + after : 'Квест выполнен: +' + exp + ' EXP');
  }

  var NICK_RX = /^[\p{L}\p{N} _.\-]{2,24}$/u;
  function saveNick(e) {
    e.preventDefault();
    if (!player || !user) return; // профиль ещё не загружен
    var raw = $('nickInput').value.replace(/\s+/g, ' ').trim();
    var hint = $('nickHint');
    if (!NICK_RX.test(raw) || !/[\p{L}\p{N}]/u.test(raw)) {
      hint.textContent = 'Никнейм: 2–24 символа — буквы, цифры, пробел, «_», «-», «.».';
      hint.classList.add('is-error');
      return;
    }
    if (raw === player.username) { toast('Этот никнейм уже установлен.'); return; }
    hint.classList.remove('is-error');
    $('nickSave').disabled = true;
    Promise.all([
      P.save(user.uid, { username: raw }),
      user.updateProfile({ displayName: raw }).catch(function () { /* в профиле users/{uid} ник сохранён — этого достаточно */ })
    ]).then(function () {
      player.username = raw;
      hint.textContent = 'Готово: ник виден в шапке, профиле и в новых сообщениях чата.';
      renderAll();
      publishChip();
      toast('Никнейм изменён: ' + raw);
    }).catch(function () {
      hint.textContent = 'Не удалось сохранить никнейм. Проверьте подключение.';
      hint.classList.add('is-error');
    }).then(function () { $('nickSave').disabled = false; });
  }

  function choose(field, value, message) {
    if (!player || !user) return;
    var patch = {};
    patch[field] = value;
    player[field] = value;
    renderAll();
    publishChip();
    P.save(user.uid, patch).then(function () { toast(message); }).catch(function () { toast('Не удалось сохранить выбор.'); });
  }

  // журнал просмотров
  var searchApi = null;
  function loadSearch() {
    if (searchApi || !window.AnimeSearch) return Promise.resolve(searchApi);
    return window.AnimeSearch.load().then(function (api) { searchApi = api; return api; }).catch(function () { return null; });
  }
  function suggest() {
    if (!player) return;
    var q = $('watchInput').value.trim();
    var box = $('watchSuggest');
    if (q.length < 2) { box.hidden = true; return; }
    loadSearch().then(function (api) {
      if (!api) return;
      var have = {};
      (player.watched || []).forEach(function (w) { have[w.id] = 1; });
      var items = api.find(q, { limit: 7 }).filter(function (it) { return !have[it.type + ':' + it.id]; });
      box.replaceChildren();
      items.forEach(function (it) {
        var li = el('li');
        var b = el('button');
        b.type = 'button';
        b.append(document.createTextNode(it.title + ' '), el('small', null, [it.section, it.extra].filter(Boolean).join(' · ')));
        b.addEventListener('click', function () { addWatched({ id: it.type + ':' + it.id, title: it.title }); });
        li.appendChild(b);
        box.appendChild(li);
      });
      if (!items.length) box.appendChild(el('li', null)).appendChild(el('button', null, 'Ничего не найдено')).disabled = true;
      box.hidden = false;
    });
  }
  function saveWatched(list, message) {
    if (!player || !user) return;
    player.watched = list;
    renderAll();
    P.save(user.uid, { watched: list, watchedCount: list.length }).then(function () { toast(message); })
      .catch(function () { toast('Не удалось сохранить журнал.'); });
  }
  function addWatched(w) {
    $('watchSuggest').hidden = true;
    $('watchInput').value = '';
    var list = (player.watched || []).filter(function (x) { return x.id !== w.id; }).concat([w]).slice(-300);
    saveWatched(list, 'Мир пройден: «' + w.title + '»');
  }
  function removeWatched(w) {
    saveWatched((player.watched || []).filter(function (x) { return x.id !== w.id; }), 'Убрано из журнала: «' + w.title + '»');
  }

  // ───────── запуск ─────────
  function showGate() {
    if (P) P.setViewer(null);
    $('sysLoading').hidden = true;
    $('playerUi').hidden = true;
    $('sysGate').hidden = false;
    $('gateLogin').href = 'login.html?returnUrl=' + encodeURIComponent('/pages/profile.html');
  }

  function start(u) {
    user = u;
    P.setViewer(u.uid); // личные эксклюзивы видны только своему владельцу
    Promise.all([P.load(u.uid), P.chatCount(u.uid)]).then(function (res) {
      player = res[0] || {};
      chatCount = res[1] || 0;
      if (!player.username && u.displayName) player.username = String(u.displayName).slice(0, 24);
      player.exp = player.exp || 0;
      // синхронизация уровня и открытых наград (например, после изменения правил наград)
      var unlocked = P.computeUnlocked(player);
      var level = P.levelInfo(player.exp).level;
      if (player.level !== level || String(player.unlockedRewards || []) !== String(unlocked)) {
        P.save(u.uid, { level: level, unlockedRewards: unlocked, exp: player.exp }).catch(function () {});
        player.level = level;
        player.unlockedRewards = unlocked;
      }
      // звания уже заслужены, но ни одно не надето (или надетое больше не существует) — Система надевает самое редкое
      if (!P.currentTitle(player)) {
        var rarity = { common: 0, rare: 1, epic: 2, legendary: 3 };
        var best = unlocked.filter(function (id) { return P.REWARDS[id].type === 'title'; })
          .sort(function (a, b) { return rarity[P.REWARDS[b].rarity] - rarity[P.REWARDS[a].rarity]; })[0];
        if (best) { player.selectedTitle = best; P.save(u.uid, { selectedTitle: best }).catch(function () {}); }
      }
      $('sysLoading').hidden = true;
      $('sysGate').hidden = true;
      $('playerUi').hidden = false;
      renderAll();
      publishChip();
    }).catch(function (err) {
      $('sysLoading').querySelector('.sys-text').textContent = err && err.code === 'permission-denied'
        ? 'Нет доступа к профилю в базе (правила Firestore для users/{uid}).'
        : 'Не удалось связаться с Системой. Проверьте подключение и обновите страницу.';
    });
  }

  $('nickForm').addEventListener('submit', saveNick);
  $('titlesList').addEventListener('click', function (e) {
    if (!player) return;
    var b = e.target.closest('.title-opt');
    if (!b || b.disabled) return;
    if (!unlockedSet()[b.dataset.title]) return; // закрытое звание выбрать нельзя
    choose('selectedTitle', b.dataset.title, 'Звание установлено: ' + P.REWARDS[b.dataset.title].name);
  });
  $('avatarsList').addEventListener('click', function (e) {
    if (!player) return;
    var b = e.target.closest('.av-opt');
    if (!b || b.disabled || !unlockedSet()[b.dataset.avatar]) return;
    choose('selectedAvatar', b.dataset.avatar, 'Аватар установлен: ' + P.REWARDS[b.dataset.avatar].name);
  });
  Array.prototype.forEach.call(document.querySelectorAll('.av-tab'), function (t) {
    t.addEventListener('click', function () {
      avatarCat = t.dataset.cat;
      document.querySelectorAll('.av-tab').forEach(function (x) { x.setAttribute('aria-pressed', String(x === t)); });
      if (player) renderSettings();
    });
  });
  $('framesList').addEventListener('click', function (e) {
    if (!player) return;
    var b = e.target.closest('.frame-opt');
    if (!b || b.disabled || !unlockedSet()[b.dataset.frame]) return;
    choose('selectedFrame', b.dataset.frame, 'Рамка установлена: ' + P.REWARDS[b.dataset.frame].name);
  });
  Array.prototype.forEach.call(document.querySelectorAll('.inv-filter'), function (t) {
    t.addEventListener('click', function () {
      invFilter = t.dataset.type;
      document.querySelectorAll('.inv-filter').forEach(function (x) { x.setAttribute('aria-pressed', String(x === t)); });
      if (player) renderInventory();
    });
  });
  var watchTimer = null;
  $('watchInput').addEventListener('input', function () { clearTimeout(watchTimer); watchTimer = setTimeout(suggest, 150); });
  $('watchInput').addEventListener('focus', loadSearch);
  document.addEventListener('click', function (e) { if (!e.target.closest('.watch-search')) $('watchSuggest').hidden = true; });
  $('levelOk').addEventListener('click', function () { $('levelDialog').close(); });
  $('logoutBtn').addEventListener('click', function () {
    if (!services) return;
    services.auth.signOut().then(function () { P.clearCache(); location.href = '../index.html'; });
  });

  if (!P || !Chat) { showGate(); return; }
  P.services().then(function (s) {
    services = s;
    s.auth.onAuthStateChanged(function (u) { if (u) { if (!user || user.uid !== u.uid) start(u); } else { user = null; showGate(); } });
  }).catch(function () {
    $('sysLoading').querySelector('.sys-text').textContent = 'Не удалось загрузить Систему. Проверьте подключение и обновите страницу.';
  });
})();
