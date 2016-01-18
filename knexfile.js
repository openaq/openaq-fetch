module.exports = {
  client: 'pg',
  connection: {
    host: process.env.PSQL_HOST || 'localhost',
    user: process.env.PSQL_USER || '',
    password: process.env.PSQL_PASSWORD || '',
    database: process.env.PSQL_DATABASE || 'openaq-local'
  },
  migrations: {
    tableName: 'migrations'
  }
};
