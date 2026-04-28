const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const rootDir = __dirname;
const clientDir = path.join(rootDir, "client");
const serverDir = path.join(rootDir, "server");
const dedicatedServerPath = path.join(serverDir, "server.x86_64");
let isShuttingDown = false;

const webHost = process.env.WEB_HOST || "0.0.0.0";
const webPort = Number(process.env.WEB_PORT || 8080);
const shutdownTimeoutMs = Number(process.env.SHUTDOWN_TIMEOUT_MS || 10000);

const mimeTypes = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function getMimeType(filePath) {
  return mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function serveClient(req, res) {
  let reqPath = decodeURIComponent(req.url.split("?")[0]);
  if (reqPath === "/healthz") {
    const payload = {
      ok: true,
      web: "up",
      game_server_pid: dedicatedServer?.pid || null,
    };
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS"
    });
    res.end(JSON.stringify(payload));
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return;
  }

  if (reqPath === "/") reqPath = "/index.html";

  const filePath = path.join(clientDir, reqPath);
  if (!filePath.startsWith(clientDir)) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Bad request");
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }

    const isVersionedAsset = /\.(wasm|pck|js|png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(filePath);
    res.writeHead(200, {
      "Content-Type": getMimeType(filePath),
      "Cache-Control": isVersionedAsset
        ? "public, max-age=31536000, immutable"
        : "public, max-age=0",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

function ensureExecutable(filePath) {
  fs.chmodSync(filePath, 0o755);
}

function startDedicatedServer() {
  if (!fs.existsSync(dedicatedServerPath)) {
    throw new Error(`Dedicated server binary missing: ${dedicatedServerPath}`);
  }

  ensureExecutable(dedicatedServerPath);

  const child = spawn(dedicatedServerPath, [], {
    cwd: serverDir,
    env: {
      ...process.env,
      ARCHERS_MODE: "server",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[game-server] ${chunk}`);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[game-server] ${chunk}`);
  });

  child.on("exit", (code, signal) => {
    console.log(`[game-server] exited code=${code} signal=${signal || "none"}`);
    // If the dedicated server dies in production, stop web to avoid a half-broken deployment.
    if (!isShuttingDown) {
      process.exit(code ?? 1);
    }
  });

  return child;
}

const webServer = http.createServer(serveClient);
const dedicatedServer = startDedicatedServer();

webServer.listen(webPort, webHost, () => {
  console.log(`Web client running at http://${webHost}:${webPort}/`);
  console.log(`Health check available at http://${webHost}:${webPort}/healthz`);
  console.log("Godot dedicated server started from ./server/server.x86_64");
});

function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log("\nShutting down...");
  if (dedicatedServer && dedicatedServer.exitCode == null && !dedicatedServer.killed) {
    dedicatedServer.kill("SIGTERM");
  }
  setTimeout(() => {
    if (dedicatedServer && dedicatedServer.exitCode == null) {
      dedicatedServer.kill("SIGKILL");
    }
  }, shutdownTimeoutMs).unref();
  webServer.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
