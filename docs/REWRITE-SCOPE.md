# Часть 10 — Допустимая область переписок для Telegram-запуска

Если для **рабочего запуска через Telegram** нужны архитектурные изменения, Cursor (и любой разработчик) **разрешено переписать** перечисленные ниже части. Остальное менять только при явной необходимости.

## Разрешено переписывать

- **Frontend bootstrap / auth initialization**  
  Инициализация приложения при открытии Mini App: порядок вызовов, вызов `startTelegramBootstrap`, проверка `initData`, переход в лобби только после успешной авторизации.

- **WebSocket client bootstrap**  
  Когда и как создаётся/открывается WebSocket: после получения токена, переподключение при смене токена, использование `createWsClientProtocols(token)` и передача протоколов в `WebSocket(url, protocols)`.

- **Auth / session storage**  
  Где и как хранятся токен и пользователь (sessionStorage, localStorage, ключи), срок жизни, сброс при логауте или ошибке авторизации.

- **Backend auth routes**  
  Маршруты POST `/auth/telegram`, POST `/auth/dev`: форма тела, ответа, коды ошибок, логирование. Контракт (initData → token + user) должен сохраняться.

- **WebSocket auth extraction**  
  Как сервер извлекает токен из запроса на апгрейд: Sec-WebSocket-Protocol, опционально query-параметр в dev, проверка сессии, отклонение неавторизованных соединений.

- **Room bootstrap flow**  
  Последовательность: авторизация → подключение WS → отправка `room.create` / `room.join`; обработка `room.created` / `room.joined`; сохранение roomId, sessionToken, selfPlayerId; переход на экран ожидания и в игру.

- **Config / env layer**  
  Переменные окружения (сервер и Vite), чтение `VITE_*`, `TELEGRAM_BOT_TOKEN`, `APP_ENV`, `ALLOW_DEV_AUTH`, базовые URL API/WS, CORS, публичный URL Mini App.

- **Mini App launch integration**  
  Вызовы `Telegram.WebApp.ready()`, `expand()`, цвета, получение `initData` из `Telegram.WebApp.initData`, определение контекста (Telegram vs браузер), ссылки для BotFather (Menu Button / Web App URL).

---

## Запрещено

- **Не делать фейковый client-only room mode**  
  Не вводить режим «игра только на клиенте без сервера» как замену или обход сетевой комнаты. Допустимый изолированный режим (demo/fallback) — только когда сервер недоступен и явно описан в коде/документации, без подмены production-сценария.

- **Не отключать серверную валидацию Telegram auth**  
  В production идентичность пользователя должна определяться **только** на сервере через проверку подписи и TTL `initData` с использованием `TELEGRAM_BOT_TOKEN`. Не полагаться на `initDataUnsafe` или переданный с клиента user id без проверки подписи.

- **Не заменять production Telegram auth на dev-заглушки**  
  В production единственный путь авторизации — POST `/auth/telegram` с валидным `initData`. POST `/auth/dev` и передача токена через query-параметр WS — только для локальной разработки при `APP_ENV=development` и `ALLOW_DEV_AUTH`; в production они не должны использоваться и не должны подменять Telegram auth.

---

## Связь с другими документами

- **Definition of Done (Часть 11):** в `VERIFICATION.md` — критерии завершённости (открытие через Telegram, initData, auth, WS, create/join, два клиента в одной комнате, старт, первый цикл, нет блокирующих ошибок WS и 500 на handshake).
- Контракт WS-авторизации: `WS-AUTH-CONTRACT.md` (в корне репозитория).
- Проверка после изменений: `VERIFICATION.md` (Part 9 — сборка, локальный запуск, Telegram, игровой сценарий).
- Безопасность и секреты: не логировать `TELEGRAM_BOT_TOKEN` и сырые секреты; не доверять клиенту в определении identity в production.
