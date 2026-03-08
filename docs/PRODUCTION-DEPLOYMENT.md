# Production deployment instructions

Telegram Mini App на **https://app.rasklad-taro.online** через Cloudflare Tunnel. Один origin: фронт, API и WebSocket с одного домена.

---

## 1. Файлы, добавленные для production

| Файл | Назначение |
|------|------------|
| **apps/server/.env.production** | Production-конфиг: HOST, PORT, APP_ENV, PUBLIC_*_URL, TELEGRAM_BOT_TOKEN, CORS, TTL. |
| **cloudflared/config.yml** | Конфиг туннеля: hostname app.rasklad-taro.online → http://127.0.0.1:8080. |

В **package.json** (корень) добавлен скрипт **start** → `pnpm start:server`, чтобы из корня репозитория работала команда **pnpm start**.

---

## 2. Используемые env (production)

Загружаются из **apps/server/.env** (скопируйте из `.env.production` и подставьте секреты) или из окружения при запуске.

| Переменная | Обязательность | Пример |
|------------|----------------|--------|
| **HOST** | да | `0.0.0.0` |
| **PORT** | да | `8080` |
| **APP_ENV** | да | `production` |
| **DEPLOY_PLATFORM** | нет | `cloudflare` |
| **TRUST_PROXY** | да | `true` |
| **PUBLIC_BASE_URL** | да | `https://app.rasklad-taro.online` |
| **PUBLIC_WEB_APP_URL** | да | `https://app.rasklad-taro.online` |
| **TELEGRAM_BOT_TOKEN** | да | из BotFather |
| **AUTH_TOKEN_TTL_SECONDS** | нет | `86400` |
| **TELEGRAM_INITDATA_TTL_SECONDS** | нет | `3600` |
| **CORS_ALLOWED_ORIGINS** | нет (добавляется PUBLIC_WEB_APP_URL) | `https://app.rasklad-taro.online` |
| **STATIC_ROOT** | нет | по умолчанию `../../web/dist` относительно server dist |

---

## 3. Путь build фронта

- **Путь:** `apps/web/dist`
- **Как получить:** из корня репозитория выполнить **pnpm build** (собираются shared, server, web). Фронт попадает в `apps/web/dist`.
- **Как использует backend:** при старте сервер ищет статику в `STATIC_ROOT` или в `../../web/dist` относительно `apps/server/dist` и раздаёт её по `/` и SPA fallback (index.html для неизвестных GET).

---

## 4. Как работает Cloudflare Tunnel

- **cloudflared** поднимает туннель с именем **durak-miniapp** и по конфигу **cloudflared/config.yml** направляет трафик:
  - **app.rasklad-taro.online** → **http://127.0.0.1:8080**
  - остальные hostname → 404.
- На 8080 слушает ваш backend (Node): он раздаёт фронт, обрабатывает `/auth/telegram`, `/ws`, health и т.д. Игровая логика, WebSocket и Telegram auth не меняются — только инфраструктура.

---

## 5. Команды запуска

### Однократная настройка туннеля

```bash
# Создать туннель (появится в Cloudflare Zero Trust)
cloudflared tunnel create durak-miniapp

# Привязать DNS: app.rasklad-taro.online -> туннель
cloudflared tunnel route dns durak-miniapp app.rasklad-taro.online
```

Перед этим домен **app.rasklad-taro.online** должен быть в вашем Cloudflare-аккаунте (сайт добавлен, NS указаны).

### Сборка и запуск backend

```bash
# Из корня репозитория
pnpm build
pnpm start
```

Либо только сервер:

```bash
pnpm build
pnpm --filter @durak/server start
```

Либо с явным production env (если переменные заданы в окружении):

```bash
pnpm build
cd apps/server && NODE_ENV=production node dist/index.js
```

Перед **pnpm start** скопируйте **apps/server/.env.production** в **apps/server/.env** и задайте **TELEGRAM_BOT_TOKEN** (или экспортируйте переменные в shell).

### Запуск туннеля

В отдельном терминале (backend уже запущен на 8080):

```bash
cloudflared tunnel run durak-miniapp
```

Можно указать конфиг явно:

```bash
cloudflared tunnel run durak-miniapp --config cloudflared/config.yml
```

---

## 6. Как открыть Mini App

1. В **@BotFather** задать **Mini App URL:**  
   **https://app.rasklad-taro.online**
2. В Telegram открыть бота и нажать кнопку/меню Mini App — откроется **https://app.rasklad-taro.online**.

---

## 7. Проверка после деплоя

### Открыть в браузере

- **https://app.rasklad-taro.online** — должна открыться SPA (лендинг/лобби). Если backend запущен и туннель работает, страница загружается с этого же origin.

### Проверить Telegram auth

- Открыть Mini App из Telegram (чтобы был `initData`).
- В Network (DevTools) должен уходить **POST https://app.rasklad-taro.online/auth/telegram** с телом `{ initData }` и ответ 200 с `token` и `user`.

### Проверить WebSocket

- После успешной авторизации клиент подключается к **wss://app.rasklad-taro.online/ws** (с токеном в Sec-WebSocket-Protocol).
- В Network вкладка WS: один запрос к **wss://app.rasklad-taro.online/ws**, статус 101, первое сообщение от сервера — **connection.ready**.

### Настройка BotFather

- В @BotFather → ваш бот → **Bot Settings** → **Menu Button** / **Configure Mini App** (или аналог):
  - **Mini App URL:** `https://app.rasklad-taro.online`

---

## 8. Проверка игрового flow

1. **Telegram auth** — открыть Mini App из Telegram, в логах сервера или Network убедиться, что POST `/auth/telegram` возвращает 200.
2. **WebSocket connect** — после auth запрос к `/ws`, ответ 101, приходит `connection.ready`, UI выходит из «Подключаемся к серверу».
3. **Create room** — нажать «Создать комнату», ввод имени → комната создана, виден код комнаты.
4. **Join room** — второй пользователь (или вторая вкладка/устройство) вводит код и входит в ту же комнату.
5. **Start game** — хост нажимает «Старт» → оба переходят в игру, ходы синхронизируются.

Игровая логика, протокол WebSocket и алгоритм Telegram auth не менялись — только подготовлена production-инфраструктура.

---

## 9. Краткая шпаргалка команд

```bash
# 1) Сборка
pnpm build

# 2) Production env: скопировать и задать TELEGRAM_BOT_TOKEN
# cp apps/server/.env.production apps/server/.env
# и отредактировать apps/server/.env

# 3) Запуск backend (в одном терминале)
pnpm start

# 4) Запуск туннеля (в другом терминале)
cloudflared tunnel run durak-miniapp
```

После этого открыть Mini App в Telegram по **https://app.rasklad-taro.online**.
