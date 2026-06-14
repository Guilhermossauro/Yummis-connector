// Configuração do PM2 — inicie com: pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'whats-middle',
      script: 'src/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '600M',
      // open-wa/puppeteer pode demorar a subir o Chromium na 1ª vez.
      kill_timeout: 10000,
      env: {
        NODE_ENV: 'production'
      },
      out_file: 'logs/pm2-out.log',
      error_file: 'logs/pm2-error.log',
      merge_logs: true,
      time: true
    }
  ]
};
