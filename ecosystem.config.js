// # =============================================================
// #  ecosystem.config.js – PM2 Process Manager
// #  Priority Manager | Santher TI
// #
// #  Uso:
// #    pm2 start ecosystem.config.js
// #    pm2 save
// #    pm2 startup   (para iniciar junto com o sistema)
// # =============================================================

module.exports = {
  apps: [
    {
      name: 'priority-manager',
      script: 'server.js',
      cwd: '/opt/priority-manager',    // caminho na VM onde o projeto ficará
      instances: 1,                          // 1 instância (app usa SQLite com arquivo)
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',

      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      // Logs
      out_file: '/var/log/pm2/priority-manager-out.log',
      error_file: '/var/log/pm2/priority-manager-err.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
