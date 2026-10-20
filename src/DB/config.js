'use strict';

function databaseConfig() {
  for (const key of ['DB_USER','DB_PASSWORD','DB_NAME']) {
    if (!process.env[key]) throw new Error('Missing required environment variable: '+key);
  }
  const port = Number(process.env.DB_PORT || 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid DB_PORT');
  return { host: process.env.DB_HOST || 'postgres',port,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME };
}

module.exports = { databaseConfig };
