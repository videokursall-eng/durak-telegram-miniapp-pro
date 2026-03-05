# apps/web — React UI + Phaser canvas

Здесь будет фронтенд (Vite + React + TS) и встроенная игра на Phaser в canvas.

Рекомендуемая структура:
- `src/ui/` — React UI (экраны, компоненты, HUD)
- `src/game/` — Phaser сцены и рендер стола
- `src/telegram/` — обвязка Telegram WebApp SDK
- `src/net/` — WS клиент, auth, sync
- `src/state/` — Zustand/Redux store

Первые задачи — в `prompts/cursor/01_WEB_SCAFFOLD.md`.
