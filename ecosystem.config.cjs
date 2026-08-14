// Configuration PM2 — démarrage : pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "crow-style-bot",
      script: "dist/index.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
      max_memory_restart: "400M",
      env: {
        NODE_ENV: "production",
      },
      out_file: "logs/out.log",
      error_file: "logs/error.log",
      merge_logs: true,
      time: true,
    },
  ],
};
