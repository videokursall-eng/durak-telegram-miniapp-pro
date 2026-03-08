# Telegram Mini App Launch

## Goal
This checklist prepares the project for publication as a production Telegram Mini App with:

- a stable production URL
- BotFather integration
- a clear launch flow
- a repeatable release checklist

## Production URLs

Use two public HTTPS endpoints:

- Mini App frontend:
  - example: `https://durak.example.com`
- backend API and websocket origin:
  - example: `https://api.example.com`
  - websocket: `wss://api.example.com/ws`

If you serve the frontend and backend through the same public origin behind a reverse proxy, the Mini App may use one domain and same-origin API routing.

## Required Environment Variables

### Server
Set in `apps/server/.env` using `apps/server/.env.example`:

- `PUBLIC_BASE_URL=https://api.example.com`
- `PUBLIC_WEB_APP_URL=https://durak.example.com`
- `TELEGRAM_BOT_TOKEN=...`
- `TELEGRAM_BOT_USERNAME=durak_example_bot`
- `TELEGRAM_MINI_APP_SHORT_NAME=durak`

### Web
Set in `apps/web/.env.production` using `apps/web/.env.example`:

- `VITE_TELEGRAM_MINI_APP_URL=https://durak.example.com`
- `VITE_TELEGRAM_BOT_USERNAME=durak_example_bot`
- `VITE_TELEGRAM_MINI_APP_SHORT_NAME=durak`
- `VITE_API_BASE_URL=https://api.example.com`
- `VITE_WS_URL=wss://api.example.com/ws`

## Bot Integration

### 1. Create and verify the bot
In `@BotFather`:

1. Run `/newbot` if the bot does not exist yet.
2. Save the bot token securely.
3. Set the bot username you will publish, for example `@durak_example_bot`.

### 2. Create the Mini App entry
In `@BotFather`:

1. Run `/newapp`.
2. Choose the target bot.
3. Set the Mini App title.
4. Set the production HTTPS URL of the Mini App frontend.

### 3. Configure launch entry points
Recommended launch entry points:

- Menu button:
  - use `/setmenubutton`
  - set button text like `Play Durak`
  - point it to the production Mini App URL
- Direct Mini App link:
  - use `/myapps`
  - confirm the app short name and direct app link

## Launch Flow

The intended production launch flow is:

1. User opens the bot in Telegram.
2. User taps the menu button or direct Mini App link.
3. Telegram opens the production Mini App over HTTPS.
4. The frontend receives `Telegram.WebApp.initData`.
5. The frontend sends `initData` to `POST /auth/telegram`.
6. The backend verifies `initData` and issues a trusted `authToken`.
7. The frontend opens websocket with auth subprotocol.
8. The user lands in lobby, reconnect flow, or active room state.

## Reverse Proxy and Cloudflare

Production launch assumes:

- valid HTTPS certificate
- websocket proxying on `/ws`
- same `Host` and forwarded proto headers preserved
- Cloudflare websocket support enabled if used
- Telegram domain pointing to the final public Mini App URL

Use `docs/DEPLOYMENT.md` for reverse proxy and Cloudflare details.

## App Store and Publication Readiness

Before publishing:

- finalize production branding:
  - app name
  - bot name
  - bot description
  - menu button label
- confirm the final production domain is stable
- ensure all URLs are HTTPS
- ensure Telegram auth verification is enabled in production

## Release Checklist

### Infra
- production frontend URL is live over HTTPS
- backend API URL is live over HTTPS
- websocket endpoint is reachable over `wss://`
- reverse proxy forwards websocket upgrades on `/ws`
- `/healthz` and `/readyz` return success in production

### Environment
- `TELEGRAM_BOT_TOKEN` is set in server environment
- `TELEGRAM_BOT_USERNAME` is set consistently across env and BotFather
- `TELEGRAM_MINI_APP_SHORT_NAME` matches the configured app
- frontend `VITE_API_BASE_URL` and `VITE_WS_URL` match production routing
- frontend `VITE_TELEGRAM_MINI_APP_URL` matches the published Mini App URL

### Telegram
- bot exists and is reachable in Telegram
- Mini App is created via BotFather
- menu button is configured to the production URL
- direct Mini App link works
- production domain is the same one registered in BotFather for the Mini App

### Product QA
- Mini App opens inside Telegram iOS
- Mini App opens inside Telegram Android
- Mini App opens inside Telegram Desktop
- auth succeeds from Telegram `initData`
- lobby flow works
- create room works
- join room works
- start match works
- reconnect after websocket drop works
- reconnect after app reopen works
- no mixed-content errors are present
- no hardcoded localhost or `:8080` references remain in production build

### Release Ops
- run `pnpm deploy:check`
- build web assets with production env
- build backend artifacts
- deploy backend
- deploy frontend
- run post-deploy smoke test inside Telegram
- capture the final bot link, Mini App URL, and release date in release notes

## Recommended Public Entry Points

Keep these values recorded for the release:

- bot username:
  - `@durak_example_bot`
- production Mini App URL:
  - `https://durak.example.com`
- production API URL:
  - `https://api.example.com`
- production websocket URL:
  - `wss://api.example.com/ws`

## Notes

- This project already reads Telegram launch context from the WebApp SDK and uses backend-verified `initData`.
- The frontend now supports explicit Telegram Mini App launch env values and can be published behind HTTPS without hardcoded dev URLs.
