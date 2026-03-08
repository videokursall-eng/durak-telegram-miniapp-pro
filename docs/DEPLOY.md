# Deploy — окружения и публикация (скелет)

## Рекомендуемая схема
- Frontend: Cloudflare Pages / Vercel (HTTPS сразу)
- Backend: Render / Fly.io / VPS
- DB: Postgres (managed) + Redis

## Переменные окружения
Смотри `.env.example` в `apps/server` и `apps/web`.

## Telegram Mini App launch
Подробный production launch flow, BotFather steps и release checklist теперь описаны в `docs/TELEGRAM_MINI_APP_LAUNCH.md`.

## BotFather
- привязать URL Mini App (Web App)
- сделать кнопку меню “Играть”
- /start: бот отправляет inline кнопку с web_app URL (если используешь бота-обёртку)

## Проверки перед релизом
- открывается в Telegram iOS/Android
- reconnect работает
- нет mixed-content
- проверка initData на сервере включена
