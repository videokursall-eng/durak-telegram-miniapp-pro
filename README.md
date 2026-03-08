# Durak PRO — Telegram Mini App (React UI + Phaser)

Это стартовый пакет репозитория для Telegram Mini App (Mini Game) **«Дурак: простой + переводной»** уровня production (PRO).
Цель пакета — дать структуру, документацию, протоколы, state machine и готовые промпты для работы в Cursor/Copilot, а также задания для Figma AI / Midjourney / Leonardo / Replit.

## Что внутри
- `docs/` — PRD, правила, state machine, WS протокол, безопасность, деплой
- `prompts/` — готовые задания (Cursor / Copilot / Figma AI / арт)
- `apps/web/` — фронт: React UI + Phaser canvas внутри (заготовка структуры)
- `apps/server/` — сервер: WS + REST (заготовка структуры)
- `packages/shared/` — общие типы, модели и игровые экшены (заготовка структуры)

> Этот пакет **не запускает игру “из коробки”** — он даёт архитектуру, документы и scaffold.
> Дальше ты по шагам генерируешь и собираешь код через Cursor (см. `prompts/`).

## Быстрый старт (порядок)
1) Создай GitHub репозиторий и залей весь архив (см. раздел «GitHub»).
2) Открой репозиторий в **Cursor** и выполняй задания из `prompts/cursor/00_ROADMAP.md` по порядку.
3) Параллельно сделай дизайн в Figma по `prompts/figma/*`.
4) Арт/ассеты — по `prompts/art/*`.

## GitHub (как хранить)
- Основная ветка: `main`
- Разработка: `dev`
- Каждая задача — отдельная ветка `feat/<коротко>` и Pull Request
- Коммиты: `feat: ...`, `fix: ...`, `chore: ...`, `docs: ...`

Рекомендуемый PR-шаблон: `docs/PR_TEMPLATE.md`.

## Важно про Telegram Mini Apps
- Mini App должен открываться по HTTPS
- На сервере нужно проверять `initData` (подпись Telegram), иначе легко подменить пользователя.
Смотри `docs/SECURITY.md`.

## Запуск через Telegram (BotFather / Mini App)

Чтобы открывать приложение из Telegram как WebApp:

1. **Задать Web App URL в BotFather**  
   [@BotFather](https://t.me/BotFather) → ваш бот → **Bot Settings** → **Menu Button** → **Configure menu button** → в поле **URL** укажите **HTTPS** вашего развёрнутого фронта (не localhost). Этот же URL задайте в `VITE_TELEGRAM_MINI_APP_URL` при сборке фронта.

2. **Открыть Mini App из Telegram**  
   Откройте чат с ботом → нажмите кнопку меню (слева внизу) — откроется ваш Mini App. Или используйте ссылку `https://t.me/YourBotUsername` (и при необходимости `?startapp=ShortName`).

3. **Проверить initData**  
   Приложение получает `initData` только при открытии из Telegram WebView. Убедиться можно по логам сервера: при нажатии «Создать комнату» должен появиться **"Telegram auth success"**. Либо в отладочной консоли WebView проверить `window.Telegram?.WebApp?.initData` (должна быть непустая строка).

Подробно: **TELEGRAM-BOTFATHER-SETUP.md** (настройка бота, согласование URL, проверка initData). Конфигурация env и URL: **ENV-AND-URLS.md**.

Удачной разработки! 🚀
