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

Удачной разработки! 🚀
