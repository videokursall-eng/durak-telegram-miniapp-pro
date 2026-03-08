# Деплой на VPS (без Docker, без cloudflared)

Мини-приложение в Telegram открывается по `https://app.games-telegram.online`. Nginx принимает HTTPS и проксирует на Node-сервер на `127.0.0.1:8080`.

## Требования на VPS

- Ubuntu 22.04 (или другой Linux с systemd)
- Node.js 20+ (LTS)
- pnpm 9+
- nginx
- certbot (Let's Encrypt)

## 1. Установка Node.js и pnpm

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pnpm
```

## 2. Установка nginx и certbot

```bash
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

## 3. Загрузка проекта на VPS

Клонируйте репозиторий или загрузите архив в каталог, например `/var/app/durak`:

```bash
cd /var/app
git clone <your-repo-url> durak
cd durak
```

## 4. Переменные окружения

Скопируйте пример и задайте токен бота:

```bash
cp apps/server/.env.vps.example apps/server/.env
nano apps/server/.env
```

Обязательно задайте:

- `TELEGRAM_BOT_TOKEN` — токен из BotFather

Остальные переменные в `.env.vps.example` уже подходят для домена `app.games-telegram.online`.

## 5. Сборка и запуск

```bash
pnpm install
pnpm build
```

Проверка запуска вручную (после этого можно остановить Ctrl+C):

```bash
pnpm start:prod
```

В другом терминале:

```bash
curl -s http://127.0.0.1:8080/health | jq
```

Должен вернуться JSON с `"ok": true`.

## 6. Запуск через PM2

```bash
mkdir -p logs
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Полезные команды:

- `pm2 status` — статус
- `pm2 logs durak-server` — логи
- `pm2 restart durak-server` — перезапуск после изменений

## 7. Nginx

Скопируйте конфиг и включите сайт:

```bash
sudo cp nginx/app.games-telegram.online.conf /etc/nginx/sites-available/app.games-telegram.online
sudo ln -s /etc/nginx/sites-available/app.games-telegram.online /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 8. SSL (Let's Encrypt)

Домен `app.games-telegram.online` должен указывать на IP VPS (A-запись). Затем:

```bash
sudo certbot --nginx -d app.games-telegram.online
```

Certbot сам настроит SSL в nginx и редирект HTTP → HTTPS.

## 9. BotFather

В BotFather → ваш бот → Menu Button / Mini App укажите URL:

```
https://app.games-telegram.online
```

## 10. Проверка

1. Откройте в браузере: `https://app.games-telegram.online` — должна открыться игра.
2. Откройте мини-приложение из Telegram — должен пройти auth, WebSocket и отобразиться лобби.

## Перезапуск после обновления кода

```bash
cd /var/app/durak
git pull
pnpm install
pnpm build
pm2 restart durak-server
```

## Что не используется на VPS

- **cloudflared** — не нужен; домен указывает прямо на VPS
- **Docker** — не используется; приложение запускается через PM2
- **trycloudflare** — не используется

## Структура запуска

- `pnpm build` — собирает shared, server (TS → dist), web (Vite → dist).
- `pnpm start:prod` — запускает `node apps/server/dist/index.js` из корня репозитория; сервер отдаёт статику из `apps/web/dist` и обрабатывает `/auth/telegram`, `/ws`, `/health`.
