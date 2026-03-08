# Запуск через Telegram BotFather / Mini App

Пошаговая настройка бота и проверка, что приложение открывается как WebApp с `initData`.

---

## 1. Где формируется Mini App launch URL

**Launch URL** — это HTTPS-адрес вашего фронта, который вы указываете в BotFather. В проекте он задаётся одной переменной:

| Где | Переменная | Назначение |
|-----|------------|------------|
| **Сборка фронта** | `VITE_TELEGRAM_MINI_APP_URL` | Публичный HTTPS URL развёрнутого приложения (тот же, что в BotFather). |
| **Код** | `getConfiguredTelegramMiniAppUrl()` / `getMiniAppLaunchUrl()` | Читают эту переменную (`apps/web/src/lib/telegram.ts`). |

Итог: **Mini App launch URL** = значение `VITE_TELEGRAM_MINI_APP_URL` при сборке = **тот же URL**, который нужно прописать в BotFather в качестве Web App / Menu Button URL. Не используйте localhost — Telegram откроет только HTTPS.

---

## 2. Согласование: bot username, short name, Web App URL

Должны быть согласованы между BotFather и env фронта:

| В BotFather / настройках бота | В проекте (frontend build) |
|-------------------------------|-----------------------------|
| **Web App URL** (Menu Button или Web App) | `VITE_TELEGRAM_MINI_APP_URL` — тот же HTTPS URL. |
| **@username** бота | `VITE_TELEGRAM_BOT_USERNAME` (без @). |
| **Short name** Mini App (если задан) | `VITE_TELEGRAM_MINI_APP_SHORT_NAME`. |

На бэкенде в CORS должен быть **origin**, совпадающий с этим URL (например через `PUBLIC_WEB_APP_URL` или `CORS_ALLOWED_ORIGINS`). См. **ENV-AND-URLS.md**.

---

## 3. Что настроить в BotFather

Сделайте по шагам:

1. **Создать бота**  
   Откройте [@BotFather](https://t.me/BotFather) → `/newbot` → имя и username. Сохраните **токен** → это `TELEGRAM_BOT_TOKEN` на сервере.

2. **Задать Web App URL (Mini App)**  
   - **Вариант A (Menu Button):** BotFather → ваш бот → **Bot Settings** → **Menu Button** → **Configure menu button** → укажите **URL**: ваш HTTPS (например `https://your-app.pages.dev`). Это и есть **Mini App launch URL**.  
   - **Вариант B (Web App в меню):** В описании/командах бота можно указать ссылку вида `https://t.me/YourBotUsername?startapp=ShortName` (Short name задаётся в BotFather для Mini App).  
   В обоих случаях **URL должен быть HTTPS** и вести на развёрнутый фронт. **Не указывайте localhost.**

3. **Short name (по желанию)**  
   Если хотите ссылку вида `t.me/Bot?startapp=SHORT_NAME`: BotFather → ваш бот → **Bot Settings** → **Menu Button** или настройки Mini App → задайте short name. Этот же short name пропишите в `VITE_TELEGRAM_MINI_APP_SHORT_NAME`.

4. **Итог для проекта**  
   - На сервере: `TELEGRAM_BOT_TOKEN` = токен из BotFather.  
   - На фронте при сборке: `VITE_TELEGRAM_MINI_APP_URL` = тот же URL, что в пункте 2.  
   - В CORS на сервере: origin этого URL разрешён.

---

## 4. Как задать Web App URL

- В BotFather: **Bot Settings** → **Menu Button** → **Configure menu button** → в поле **URL** вставьте полный HTTPS вашего фронта (например `https://your-app.pages.dev` или `https://your-domain.com/miniapp`).  
- Этот URL должен **совпадать** с тем, на который реально отдаётся собранное приложение, и с `VITE_TELEGRAM_MINI_APP_URL` при сборке.

---

## 5. Как открыть Mini App из Telegram

- **Через кнопку меню:** Откройте чат с ботом → слева внизу кнопка меню (или иконка меню) → нажмите — откроется WebView с вашим URL (Mini App).  
- **По ссылке:** Отправьте в любой чат ссылку `https://t.me/YourBotUsername` (или `https://t.me/YourBotUsername?startapp=ShortName`, если задан short name) и откройте её — откроется бот; затем кнопка меню откроет Mini App.  
- В коде ссылку для шаринга можно получить через `getTelegramBotAppLink()` (`apps/web/src/lib/telegram.ts`).

---

## 6. Как проверить initData

Приложение открыто как WebApp только если Telegram подставляет `initData`. Проверка:

1. **Откройте Mini App из Telegram** (кнопка меню или ссылка на бота с `?startapp=...`).  
2. **Встроенные средства Telegram:** В WebView Telegram нет обычной консоли. Варианты:
   - **Логи на бэкенде:** При нажатии «Создать комнату» / «Войти» фронт шлёт POST `/auth/telegram` с `initData`. В логах сервера при успехе будет строка **"Telegram auth success"** — значит `initData` был передан и проверен.  
   - **Отладка через внешний браузер (если поддерживается):** Некоторые окружения позволяют открыть WebView с отладкой (например Chrome inspect для Android WebView). В консоли выполните:
     ```js
     window.Telegram?.WebApp?.initData
     ```
     Непустая строка (query-формат) — `initData` есть.  
3. **Локальная проверка без Telegram:** В браузере на localhost `initData` будет пустой (нет Telegram WebView). Для проверки полного flow нужен реальный запуск из Telegram или туннель с HTTPS и URL, прописанным в BotFather.

---

## 7. Чеклист: приложение открывается как WebApp

- [ ] В BotFather задан **HTTPS** URL (Menu Button / Web App), не localhost.  
- [ ] Фронт развёрнут по этому URL и собран с тем же значением в `VITE_TELEGRAM_MINI_APP_URL`.  
- [ ] В Telegram при нажатии кнопки меню бота открывается ваш интерфейс.  
- [ ] При действии «Создать комнату» в логах сервера есть **"Telegram auth success"** (значит `initData` передан и принят).  
- [ ] Bot username и при необходимости short name совпадают с `VITE_TELEGRAM_BOT_USERNAME` и `VITE_TELEGRAM_MINI_APP_SHORT_NAME`.

Дополнительно: **TELEGRAM-MINI-APP-PRODUCTION.md**, **ENV-AND-URLS.md**.
