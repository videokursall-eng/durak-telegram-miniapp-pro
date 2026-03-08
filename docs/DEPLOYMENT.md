# Production Deployment

## Overview
This project is deployment-ready for a production setup where:

- the web app is built as static assets
- the backend runs behind a reverse proxy
- HTTPS is terminated by Nginx, Caddy, ingress, or Cloudflare
- websocket traffic is proxied to the backend on `/ws`
- health checks use `/health`, `/healthz`, and `/readyz`

For Telegram-specific publication steps, see `docs/TELEGRAM_MINI_APP_LAUNCH.md`.

## Environment Variables

### Server
Use `apps/server/.env.example` as the template.

Required:
- `TELEGRAM_BOT_TOKEN`

Recommended production values:
- `APP_ENV=production`
- `HOST=0.0.0.0`
- `PORT=8080`
- `TRUST_PROXY=true`
- `AUTH_TOKEN_TTL_SECONDS=86400`
- `TELEGRAM_INITDATA_TTL_SECONDS=3600`
- `DEPLOY_PLATFORM=cloudflare`

### Web
Use `apps/web/.env.example` as the template.

Recommended production values:
- `VITE_SERVER_ORIGIN=https://api.example.com`
- `VITE_API_BASE_URL=https://api.example.com`
- `VITE_WS_URL=wss://api.example.com/ws`

If the backend is exposed on the same public origin through a reverse proxy, `VITE_SERVER_ORIGIN`, `VITE_API_BASE_URL`, and `VITE_WS_URL` may be omitted and the app will use same-origin URLs in production.

## Build and Start

### Full monorepo build
```bash
pnpm build:prod
```

### Backend
```bash
pnpm --filter @durak/server build
pnpm --filter @durak/server start
```

### Web
```bash
pnpm --filter web build
pnpm --filter web preview
```

### Deployment validation
```bash
pnpm deploy:check
```

## Health Checks

The backend exposes:

- `/health` - detailed liveness payload
- `/healthz` - simple liveness probe
- `/readyz` - readiness payload including deployment-relevant checks

Recommended probes:

- load balancer liveness: `/healthz`
- orchestrator readiness: `/readyz`
- manual inspection: `/health`

## Reverse Proxy

### Required behavior
- serve web static assets over HTTPS
- proxy `POST /auth/telegram` to backend
- proxy `GET /health`, `/healthz`, `/readyz` to backend
- proxy websocket upgrades on `/ws`
- forward `Host`, `X-Forwarded-For`, and `X-Forwarded-Proto`

### Example Nginx config
```nginx
server {
  listen 443 ssl http2;
  server_name durak.example.com;

  ssl_certificate /etc/letsencrypt/live/durak.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/durak.example.com/privkey.pem;

  root /var/www/durak-web;
  index index.html;

  location / {
    try_files $uri /index.html;
  }

  location /auth/telegram {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }

  location /health {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }

  location /healthz {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }

  location /readyz {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }

  location /ws {
    proxy_pass http://127.0.0.1:8080/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }
}
```

## Cloudflare

Recommended:

- enable proxying for the public hostname
- use `Full (strict)` TLS mode
- keep websocket support enabled
- point Cloudflare to the reverse proxy or ingress, not directly to a local dev process
- keep backend `TRUST_PROXY=true`

## Notes

- The backend itself does not terminate TLS; HTTPS is expected at the reverse proxy or Cloudflare edge.
- In production the frontend no longer relies on hardcoded `:8080` URLs. It uses env overrides when provided and otherwise falls back to same-origin API and websocket paths.
