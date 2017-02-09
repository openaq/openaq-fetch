module.exports = {
  client: 'pg',
  connection: {
    host: process.env.PSQL_HOST || 'localhost',
    user: process.env.PSQL_USER || '',
    password: process.env.PSQL_PASSWORD || '',
    database: process.env.PSQL_DATABASE || 'openaq-local'
  },
  pool: {
    min: process.env.PSQL_POOL_MIN || 2,
    max: process.env.PSQL_POOL_MAX || 10
  },
  migrations: {
    tableName: 'migrations'
  }
};
