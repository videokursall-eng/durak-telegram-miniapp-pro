# Структура репозитория (дерево)

```text
durak-telegram-miniapp-pro/
├─ apps/
│  ├─ web/                      # фронтенд: React UI + Phaser
│  │  ├─ src/
│  │  │  ├─ ui/                  # React screens/components/HUD
│  │  │  ├─ game/                # Phaser scenes, rendering, animations
│  │  │  ├─ net/                 # WS client, REST client, reconnect
│  │  │  ├─ state/               # Zustand/Redux store
│  │  │  ├─ telegram/            # Telegram WebApp SDK wrapper
│  │  │  └─ assets/              # UI + table + cards
│  │  ├─ .env.example
│  │  └─ README.md
│  ├─ server/                   # backend: auth + ws + match orchestration
│  │  ├─ src/
│  │  │  ├─ http/                # REST endpoints
│  │  │  ├─ ws/                  # websocket gateway, rooms
│  │  │  ├─ match/               # game loop, orchestration
│  │  │  ├─ store/               # repositories (db/redis)
│  │  │  └─ log/                 # logging utils
│  │  ├─ .env.example
│  │  └─ README.md
├─ packages/
│  └─ shared/                   # общие типы и rules engine
│     ├─ src/
│     └─ README.md
├─ docs/                        # спецификации и процессы
│  ├─ PRD.md
│  ├─ RULES_DURAK.md
│  ├─ STATE_MACHINE.md
│  ├─ WS_PROTOCOL.md
│  ├─ SECURITY.md
│  ├─ DEPLOY.md
│  ├─ PR_TEMPLATE.md
│  └─ REPO_STRUCTURE.md
├─ prompts/                     # готовые задания для нейросетей
│  ├─ cursor/
│  ├─ copilot/
│  ├─ figma/
│  ├─ art/
│  └─ replit/
├─ README.md
├─ LICENSE
└─ .gitignore
```
