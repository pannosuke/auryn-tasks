module.exports = {
  apps: [{
    name: 'auryn-tasks',
    script: 'server.js',
    cwd: 'C:\\Users\\Eric\\.openclaw\\workspace\\auryn-tasks',
    watch: false,
    restart_delay: 3000,
    env: {
      NODE_ENV: 'production',
      PORT: 9092
    }
  }]
}
