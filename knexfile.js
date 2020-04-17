const {
  psqlHost,
  psqlPort,
  psqlUser,
  psqlPassword,
  psqlDatabase,
  psqlPoolMin,
  psqlPoolMax
} = require('./lib/env').getEnv();

module.exports = {
  client: 'pg',
  connection: {
    host: psqlHost,
    port: psqlPort,
    user: psqlUser,
    password: psqlPassword,
    database: psqlDatabase
  },
  pool: {
    min: psqlPoolMin,
    max: psqlPoolMax
  },
  acquireConnectionTimeout: 600000,
  migrations: {
    tableName: 'migrations'
  }
};
