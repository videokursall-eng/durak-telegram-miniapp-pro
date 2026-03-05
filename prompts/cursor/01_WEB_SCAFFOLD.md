# Cursor Task — apps/web scaffold (React + Phaser)

**Контекст:**
- Vite + React + TypeScript
- Phaser canvas встроен в React компонент
- UI: React (HUD, кнопки), Game rendering: Phaser

## Задача
1) Создай структуру:
- `src/ui/` (screens, components)
- `src/game/` (phaser init + scenes)
- `src/net/` (api + ws client)
- `src/state/` (zustand store)
- `src/telegram/` (telegram wrapper)

2) Реализуй компонент:
- `PhaserCanvas.tsx` — монтирует Phaser в div, корректно destroy при unmount

3) Реализуй `App`:
- сверху React HUD (кнопки)
- по центру canvas

4) Сделай `dev mode`:
- если Telegram WebApp не найден — использовать мок пользователя.

## Критерии готовности
- `pnpm dev` поднимает web
- canvas виден
- нет утечек при hot reload (phaser корректно пересоздаётся)
