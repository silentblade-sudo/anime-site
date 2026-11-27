/* Поиск по полному ростеру персонажей на страницах игр (pages/honkai.html, pages/genshin.html).
 * Разметка: поле [data-roster-search], карточки [data-roster-item] с атрибутом data-search,
 * группы [data-roster-group] (скрываются, если в них ничего не найдено), счётчик [data-roster-count].
 * Без поиска сетка остаётся ровной: последний ряд группы растягивается правилами CSS .is-fill. */
(function () {
  'use strict';
  var input = document.querySelector('[data-roster-search]');
  if (!input) return;
  var items = Array.prototype.slice.call(document.querySelectorAll('[data-roster-item]'));
  var groups = Array.prototype.slice.call(document.querySelectorAll('[data-roster-group]'));
  var counter = document.querySelector('[data-roster-count]');
  var total = items.length;
  var norm = function (s) { return String(s || '').toLowerCase().replace(/ё/g, 'е'); };
  items.forEach(function (it) { it._search = norm(it.getAttribute('data-search') + ' ' + it.textContent); });

  function apply() {
    var q = norm(input.value).trim();
    var shown = 0;
    items.forEach(function (it) {
      var ok = !q || it._search.indexOf(q) !== -1;
      it.hidden = !ok;
      if (ok) shown++;
    });
    groups.forEach(function (g) {
      var any = g.querySelector('[data-roster-item]:not([hidden])');
      g.hidden = !any;
      g.classList.toggle('is-filtered', !!q);   // при поиске растяжку последнего ряда отключаем
    });
    if (counter) counter.textContent = q ? 'Найдено: ' + shown + ' из ' + total : 'Всего: ' + total;
  }
  input.addEventListener('input', apply);
  apply();
})();
