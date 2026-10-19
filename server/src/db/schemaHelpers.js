// Idempotent schema changes for migrations that may run against a live
// database. MySQL DDL is not transactional, so a migration can stop half-way;
// every step here checks the current schema first and can safely run again.
// Kept outside src/migrations because Umzug treats every file there as a migration.

async function hasColumn(qi, table, column) {
  const columns = await qi.describeTable(table);
  return Object.prototype.hasOwnProperty.call(columns, column);
}

async function addColumnIfMissing(qi, table, column, definition) {
  if (await hasColumn(qi, table, column)) return false;
  await qi.addColumn(table, column, definition);
  return true;
}

async function removeColumnIfPresent(qi, table, column) {
  if (!(await hasColumn(qi, table, column))) return false;
  await qi.removeColumn(table, column);
  return true;
}

async function hasIndexOn(qi, table, column) {
  const indexes = await qi.showIndex(table);
  return indexes.some((ix) => (ix.fields || []).some((f) => f.attribute === column));
}

async function addIndexIfMissing(qi, table, column) {
  if (await hasIndexOn(qi, table, column)) return false;
  await qi.addIndex(table, [column]);
  return true;
}

async function removeIndexIfPresent(qi, table, column) {
  if (!(await hasIndexOn(qi, table, column))) return false;
  await qi.removeIndex(table, [column]);
  return true;
}

// Values currently allowed by an ENUM column, e.g. ['pending', 'sent'].
async function enumValues(qi, table, column) {
  const columns = await qi.describeTable(table);
  const type = columns[column]?.type || '';
  return [...type.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1]);
}

module.exports = { hasColumn, addColumnIfMissing, removeColumnIfPresent, addIndexIfMissing, removeIndexIfPresent, enumValues };
