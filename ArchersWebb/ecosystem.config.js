module.exports = {
  apps: [
    {
      name: "archerswebb",
      script: "./start.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        WEB_HOST: "0.0.0.0",
        WEB_PORT: 8080,
        SHUTDOWN_TIMEOUT_MS: 10000,
      },
    },
  ],
};
