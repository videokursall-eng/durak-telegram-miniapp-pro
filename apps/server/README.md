# apps/server — WS + REST API

Здесь будет сервер: Fastify/NestJS, авторизация Telegram initData, WS протокол, матчи и комнаты.

Рекомендуемая структура:
- `src/http/` — REST: auth, health
- `src/ws/` — ws gateway, rooms
- `src/match/` — orchestration матчей
- `src/store/` — DB/Redis, репозитории
- `src/log/` — логирование

Первые задачи — в `prompts/cursor/02_SERVER_SCAFFOLD.md`.
