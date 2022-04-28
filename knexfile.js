import _env from './src/lib/env.js';

const {
  psqlHost,
  psqlPort,
  psqlUser,
  psqlPassword,
  psqlDatabase,
  psqlPoolMin,
  psqlPoolMax
} = _env();

export default {
  client: 'pg',
  connection: {
    host: psqlHost,
    port: psqlPort,
    user: psqlUser,
    password: psqlPassword,
    database: psqlDatabase,
    ssl: { rejectUnauthorized: false },
  },
  pool: {
    min: psqlPoolMin,
    max: psqlPoolMax
  },
  acquireConnectionTimeout: 600000
};
