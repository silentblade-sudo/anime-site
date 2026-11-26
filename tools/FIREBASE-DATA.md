# Данные сайта в Firebase (проект `anime-world-3a951`)

Папка `tools/` на Hosting не публикуется (`firebase.json → hosting.ignore`).

## 1. Firebase Hosting — общие статичные JSON (одинаковые для всех)

| Файл | URL | Кто читает | Кэш |
|---|---|---|---|
| `data/schedule.json` | https://anime-world-3a951.web.app/data/schedule.json | `pages/news.html` (график), `js/player-notify.js` (серии, премьеры, сезоны) | `no-cache` (сверка по ETag) |
| `data/site-events.json` | https://anime-world-3a951.web.app/data/site-events.json | `js/player-notify.js` (категория «Сайт») | `no-cache` |
| `data/anime.json` | …/data/anime.json | каталог, поиск, страница тайтла | 1 час |
| `data/anime-synonyms.json` | …/data/anime-synonyms.json | поиск | 1 час |

Публичные данные не кладём в Firestore: на Hosting они отдаются с CDN, сжатыми и без чтений базы.
Realtime Database в проекте не используется.

### Обновление

```
node tools/build-schedule.mjs      # расписание из AniList → data/schedule.json (раз в неделю)
node tools/validate-data.mjs       # проверка всех data/*.json
firebase deploy --only hosting     # проверка запускается и сама (hosting.predeploy); при ошибке деплой отменяется
```

### Новое событие сайта (`data/site-events.json`)

```json
{ "id": "site:new-section", "icon": "📣", "title": "Заголовок до 120 символов",
  "text": "Текст до 240 символов", "page": "pages/news.html", "at": "2026-12-01T12:00:00Z" }
```

- `id` — новый и уникальный, вида `site:…`. Повтор старого id в ленте не появится: защита от дублей.
- `at` в будущем — анонс по расписанию: событие появится в ленте, когда наступит это время.
- `page` — путь от корня сайта; проверка убедится, что такая страница есть.

## 2. Firestore — личные данные Игрока

Документ `users/{uid}`. Все записи сайта — `set(..., { merge: true })`: поля коллекции AnimeVerse (`anime`, `username` …) не затираются.

| Поле | Тип | Пишет |
|---|---|---|
| `notifications` | массив до 80 объектов `{ id, cat, icon, title, text, href, at, read, fav }` | `js/player-notify.js` |
| `notificationsCleared` | массив до 300 строк — id очищенных уведомлений (чтобы не появлялись снова) | `js/player-notify.js` |
| `exp`, `level`, `claimedQuests`, `selectedAvatar`, `selectedFrame`, `selectedTitle`, `watched`, `lastDailyClaim`, `dailyStreak`, `dailyTotal`, `playerUpdatedAt` | — | `js/profile-page.js` / `js/player-core.js` |

- `cat` — одно из `quest | reward | episode | site`.
- `at` — время в миллисекундах.
- id событий: `quest-ready:<квест>[:<день>]`, `ep:<anilistId>:<серия>`, `ep-soon:…`, `premiere:<anilistId>`, `season:<anilistId>`, `site:…`.

Правила для `users/{uid}` — ваши, в Firebase Console. Владелец документа должен иметь право писать свой документ, иначе лента хранится только локально в браузере. Пример:

```
match /users/{uid} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
```

- Коллекции `chat_messages` и `festivals` эти данные не затрагивают.
- Правила чата — в `firestore.chat.rules`; в `firebase.json` их намеренно нет, чтобы деплой не заменил правила проекта.
