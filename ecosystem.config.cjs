/**
 * PM2 ecosystem config for VPS production.
 * Run from repo root after: pnpm build
 *   pm2 start ecosystem.config.cjs
 *   pm2 save && pm2 startup
 */
const path = require("node:path");

module.exports = {
  apps: [
    {
      name: "durak-server",
      script: "apps/server/dist/index.js",
      cwd: path.resolve(__dirname),
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production" },
      error_file: "logs/pm2-err.log",
      out_file: "logs/pm2-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
