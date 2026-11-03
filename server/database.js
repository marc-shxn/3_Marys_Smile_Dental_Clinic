import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';

const { Pool } = pg;
const transactions = new AsyncLocalStorage();

function postgresSql(sql) {
  const text = String(sql).replace(/\bunixepoch\(\s*([a-z_][a-z0-9_.]*)\s*\)/gi, (_match, value) => `FLOOR(EXTRACT(EPOCH FROM NULLIF(${value}::text, '')::timestamptz))::bigint`)
    .replace(/\bunixepoch\(\s*\)/gi, 'FLOOR(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP))::bigint');
  let output = '';
  let parameter = 0;
  let quote = '';
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < text.length; index += 1) {
    const current = text[index];
    const next = text[index + 1];
    if (lineComment) {
      output += current;
      if (current === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      output += current;
      if (current === '*' && next === '/') { output += next; index += 1; blockComment = false; }
      continue;
    }
    if (quote) {
      output += current;
      if (current === quote) {
        if (next === quote) { output += next; index += 1; }
        else quote = '';
      } else if (current === '\\' && quote === "'" && next) { output += next; index += 1; }
      continue;
    }
    if (current === '-' && next === '-') { output += current + next; index += 1; lineComment = true; continue; }
    if (current === '/' && next === '*') { output += current + next; index += 1; blockComment = true; continue; }
    if (current === "'" || current === '"') { quote = current; output += current; continue; }
    if (current === '?') { parameter += 1; output += `$${parameter}`; continue; }
    output += current;
  }
  return output;
}

function databaseFor(executor) {
  const connectionForQuery = () => transactions.getStore()?.client || executor;
  return {
    prepare(sql) {
      const statement = postgresSql(sql);
      return {
        async get(...params) {
          const result = await connectionForQuery().query(statement, params);
          return result.rows[0];
        },
        async all(...params) {
          const result = await connectionForQuery().query(statement, params);
          return result.rows;
        },
        async run(...params) {
          const result = await connectionForQuery().query(statement, params);
          return {
            changes: result.rowCount,
            lastInsertRowid: result.rows[0]?.visit_id ?? null,
            rows: result.rows,
          };
        },
      };
    },
    async exec(sql) {
      const command = String(sql).trim().replace(/;+$/, '').trim().toUpperCase();
      const current = transactions.getStore();
      if (/^BEGIN(?:\s|$)/.test(command)) {
        if (!executor.connect) throw new Error('A transaction cannot be started from a transaction client.');
        const client = await executor.connect();
        try {
          await client.query('BEGIN');
          transactions.enterWith({ client });
        } catch (error) {
          client.release();
          throw error;
        }
        return;
      }
      if (command === 'COMMIT' || command === 'ROLLBACK') {
        if (!current?.client) throw new Error(`Cannot ${command.toLowerCase()} outside a transaction.`);
        try {
          await current.client.query(command);
        } finally {
          current.client.release();
          transactions.enterWith(null);
        }
        return;
      }
      return connectionForQuery().query(postgresSql(sql));
    },
    async withTransaction(callback) {
      if (typeof executor.connect !== 'function') throw new Error('Nested transactions are not supported.');
      const client = await executor.connect();
      try {
        await client.query('BEGIN');
        const result = await transactions.run({ client }, () => callback(databaseFor(client)));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      if (typeof executor.end === 'function') await executor.end();
    },
  };
}

export function createDatabase(connectionString = process.env.DATABASE_URL) {
  if (!String(connectionString || '').trim()) throw new Error('DATABASE_URL must contain a Supabase PostgreSQL connection string.');
  const pool = new Pool({
    connectionString,
    max: Math.max(1, Number(process.env.PG_POOL_MAX) || 8),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: true },
    application_name: 'marys-smile-api',
  });
  pool.on('error', error => console.error('Idle PostgreSQL connection error:', error.message));
  const database = databaseFor(pool);
  database.withContext = callback => transactions.run(null, callback);
  return database;
}

export { postgresSql };
