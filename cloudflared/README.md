# Not used for VPS production

For production deployment on a VPS, the app is served directly by nginx → Node.  
No cloudflared or tunnel is required.

See [DEPLOYMENT.md](../DEPLOYMENT.md) in the repo root.

If you still use cloudflared for local testing, keep your credentials and run:

    cloudflared tunnel --config cloudflared/config.yml run <tunnel-name>
