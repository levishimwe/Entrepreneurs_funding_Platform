// Safe one-line descriptions of database errors for logs: the error class,
// the MySQL code and the message only. Never the SQL, its parameters or the
// connection settings, which can contain emails, hashes or credentials.
const DB_ERRORS = new Set(['SequelizeDatabaseError', 'SequelizeConnectionError', 'SequelizeConnectionRefusedError', 'SequelizeHostNotFoundError', 'SequelizeConnectionTimedOutError', 'SequelizeAccessDeniedError', 'SequelizeTimeoutError']);

const isDatabaseError = (err) => Boolean(err && (DB_ERRORS.has(err.name) || err.name?.startsWith('SequelizeConnection')));

function describeDbError(err) {
  const code = err?.parent?.code || err?.original?.code || err?.code;
  return `${err?.name || 'Error'}${code ? ` ${code}` : ''}: ${err?.message || String(err)}`;
}

// ER_BAD_FIELD_ERROR / ER_NO_SUCH_TABLE: the code is ahead of the database.
const isSchemaMismatch = (err) => ['ER_BAD_FIELD_ERROR', 'ER_NO_SUCH_TABLE'].includes(err?.parent?.code || err?.original?.code);

module.exports = { isDatabaseError, describeDbError, isSchemaMismatch };
