import 'dotenv/config';

export const config = {
  sql: {
    server: process.env.SQL_SERVER,
    database: process.env.SQL_DATABASE,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    port: Number(process.env.SQL_PORT || 1433),
    options: {
      trustServerCertificate: true
    }
  },
  app: {
    port: Number(process.env.PORT || 4000),
    allowOrigin: process.env.ALLOW_ORIGIN || '*',
    spName: process.env.CBMEDIC_SP || 'usp_CBMEDIC_LIQUIDACIONES_BASE'
  }
};
