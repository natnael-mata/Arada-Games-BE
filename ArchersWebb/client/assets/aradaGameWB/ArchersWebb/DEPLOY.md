# ArchersWebb Production Deployment

This project is finalized as one deployable structure:

- `client/`: Godot web export assets served by Node.
- `server/`: Godot dedicated server binary.
- `start.js`: unified launcher (starts web + dedicated server together).
- `archerswebb.service`: optional systemd service template.
- `ecosystem.config.js`: optional PM2 process manager config.

## 1) Quick Run (single command)

```bash
cd /home/natnael/Videos/ArchersWebb
node start.js
```

Open:

- `http://localhost:8080`
- health check: `http://localhost:8080/healthz`

## 2) Runtime Config (env vars)

- `WEB_HOST` (default `0.0.0.0`)
- `WEB_PORT` (default `8080`)
- `SHUTDOWN_TIMEOUT_MS` (default `10000`)

Example:

```bash
WEB_HOST=0.0.0.0 WEB_PORT=8080 node start.js
```

## 3) Production with systemd (recommended)

On your VPS:

```bash
sudo mkdir -p /opt/archerswebb
sudo cp -r . /opt/archerswebb
sudo chown -R www-data:www-data /opt/archerswebb
sudo cp /opt/archerswebb/archerswebb.service /etc/systemd/system/archerswebb.service
sudo systemctl daemon-reload
sudo systemctl enable --now archerswebb
sudo systemctl status archerswebb
```

Logs:

```bash
journalctl -u archerswebb -f
```

## 4) Production with PM2 (alternative)

```bash
npm i -g pm2
cd /opt/archerswebb
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## 5) Network / Hosting Notes

- Expose your web port (`WEB_PORT`, e.g. 8080) publicly.
- The dedicated server listens on Godot's game port (`9090` by default); open that port in firewall/security-group.
- If you use Nginx/Caddy, proxy public HTTP/HTTPS to your Node `WEB_PORT`.
- In-game address input should use your real domain/IP in production (not `localhost`).

## 6) Pre-go-live Checklist

- `node start.js` starts both services without errors.
- `curl -I http://127.0.0.1:8080` returns `200`.
- `curl http://127.0.0.1:8080/healthz` returns JSON with `ok: true`.
- Two browser sessions can connect and play via your public host/IP.
