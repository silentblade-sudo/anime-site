/* Общие настройки Firebase для сайта (проект anime-world-3a951).
 * Подключается в pages/ssylky.html и pages/login.html перед их собственными скриптами,
 * чтобы обе страницы работали с одним проектом и одним аккаунтом пользователя.
 *
 * Эти ключи веб-приложения Firebase не секретны: доступ к данным ограничивают
 * правила безопасности Firestore и список разрешённых доменов в Authentication.
 */
/* На Firebase Hosting вход через Google надёжнее, когда authDomain совпадает с доменом сайта:
   иначе в Safari и браузерах с блокировкой сторонних cookie может не сработать вход через переход
   на страницу Google. Hosting сам обслуживает /__/auth/handler на обоих доменах проекта.
   Если подключите свой домен — добавьте его в этот список и в Authorized domains. */
var ANIME_HOSTED_DOMAINS = ['anime-world-3a951.web.app', 'anime-world-3a951.firebaseapp.com'];

window.ANIME_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCeo970KWIXjlnchVgZ0JFweroVsRejZc8",
  authDomain: ANIME_HOSTED_DOMAINS.indexOf(location.hostname) !== -1 ? location.hostname : "anime-world-3a951.firebaseapp.com",
  projectId: "anime-world-3a951",
  storageBucket: "anime-world-3a951.firebasestorage.app",
  messagingSenderId: "482213775011",
  appId: "1:482213775011:web:614650e635e506052d2116",
  measurementId: "G-0D02DK65P9"
};

/* Понятные сообщения об ошибках входа на русском */
window.ANIME_AUTH_ERRORS = {
  'auth/email-already-in-use': 'Этот e-mail уже зарегистрирован',
  'auth/invalid-email': 'Некорректный e-mail',
  'auth/missing-email': 'Введите e-mail',
  'auth/missing-password': 'Введите пароль',
  'auth/weak-password': 'Слабый пароль (минимум 6 символов)',
  'auth/user-not-found': 'Пользователь не найден',
  'auth/wrong-password': 'Неверный пароль',
  'auth/invalid-credential': 'Неверный e-mail или пароль',
  'auth/invalid-login-credentials': 'Неверный e-mail или пароль',
  'auth/user-disabled': 'Этот аккаунт заблокирован',
  'auth/too-many-requests': 'Слишком много попыток. Попробуй позже',
  'auth/network-request-failed': 'Нет связи с сервером. Проверь интернет',
  'auth/popup-closed-by-user': 'Окно входа через Google было закрыто — вход отменён',
  'auth/cancelled-popup-request': 'Вход отменён: открыто другое окно входа',
  'auth/user-cancelled': 'Вход через Google отменён',
  'auth/popup-blocked': 'Браузер заблокировал окно входа. Разреши всплывающие окна для этого сайта и попробуй снова',
  'auth/unauthorized-domain': 'Этот адрес сайта не разрешён в Firebase (Authentication → Settings → Authorized domains)',
  'auth/operation-not-allowed': 'Этот способ входа выключен в Firebase Console (Authentication → Sign-in method)',
  'auth/operation-not-supported-in-this-environment': 'Вход через Google не работает, когда страница открыта как файл. Открой сайт по адресу http(s)://',
  'auth/account-exists-with-different-credential': 'Аккаунт с этим e-mail уже есть — войди по e-mail и паролю',
  'auth/web-storage-unsupported': 'Браузер блокирует хранилище сайта (cookies). Разреши их и попробуй снова',
  'auth/internal-error': 'Внутренняя ошибка Firebase. Попробуй ещё раз',
  'auth/invalid-api-key': 'Неверный ключ Firebase в настройках сайта',
  'auth/app-not-authorized': 'Приложение не авторизовано в этом проекте Firebase'
};

window.ruAuthError = function (code) {
  return window.ANIME_AUTH_ERRORS[code] || ('Ошибка входа' + (code ? ': ' + code : ''));
};

/* Вход через переход на страницу Google (когда всплывающее окно заблокировано):
   флаг в sessionStorage, чтобы после возврата отличить «отменил вход» от обычного открытия страницы */
window.markGoogleRedirect = function () {
  try { sessionStorage.setItem('animeverse_google_redirect', '1'); } catch (e) {}
};
window.takeGoogleRedirectFlag = function () {
  try {
    const was = sessionStorage.getItem('animeverse_google_redirect') === '1';
    sessionStorage.removeItem('animeverse_google_redirect');
    return was;
  } catch (e) { return false; }
};

/* Ошибки, при которых не нужно пугать пользователя красным сообщением */
window.isAuthCancel = function (code) {
  return code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' || code === 'auth/user-cancelled';
};
