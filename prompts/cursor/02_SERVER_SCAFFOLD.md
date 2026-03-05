# Cursor Task — apps/server scaffold (Fastify + WS)

## Задача
1) Fastify сервер + TypeScript.
2) REST:
- `GET /health` → { ok: true }
- `POST /auth/telegram` → { token, user }

3) WS:
- путь `/ws`
- авторизация по JWT (в query/header)
- обработчики сообщений по `type`

4) Логирование:
- pino (или встроенный fastify logger)
- correlation: requestId, matchId, userId

## Критерии готовности
- сервер стартует
- /health работает
- auth принимает мок initData в dev (фича-флаг), и реальную проверку в prod
- ws принимает join
