// One-off: copies files already stored locally (server/uploads) to the S3
// bucket under the same keys, so documents and photos uploaded before the
// switch to STORAGE_DRIVER=s3 still open in production. Reads the S3_* settings
// from server/.env; nothing is deleted locally. Safe to re-run: objects that
// already exist in the bucket are skipped.
//
//   node scripts/copy-uploads-to-s3.js --dry-run
//   node scripts/copy-uploads-to-s3.js
const fs = require('fs');
const path = require('path');
const env = require('../src/config/env');
const { sequelize, Document, User } = require('../src/models');
const { s3Driver } = require('../src/services/storage/s3');

const MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg' };
const dryRun = process.argv.includes('--dry-run');

async function main() {
  const bucket = s3Driver(env.storage.s3);
  const keys = new Set();
  for (const d of await Document.findAll({ attributes: ['storageKey'] })) keys.add(d.storageKey);
  for (const u of await User.findAll({ attributes: ['photoKey'] })) if (u.photoKey) keys.add(u.photoKey);

  console.log(`Database: ${sequelize.config.database} · bucket: ${env.storage.s3.bucket} · ${keys.size} stored files${dryRun ? ' (dry run)' : ''}`);
  const counts = { copied: 0, present: 0, missingLocally: 0 };
  for (const key of keys) {
    const file = path.resolve(env.storage.localDir, key);
    if (!file.startsWith(path.resolve(env.storage.localDir) + path.sep) || !fs.existsSync(file)) {
      counts.missingLocally += 1;
      console.log(`  missing locally: ${key}`);
      continue;
    }
    if (await bucket.exists(key)) {
      counts.present += 1;
      continue;
    }
    if (!dryRun) await bucket.putAt(key, fs.readFileSync(file), MIME[key.split('.').pop()] || 'application/octet-stream');
    counts.copied += 1;
    console.log(`  ${dryRun ? 'would copy' : 'copied'}: ${key}`);
  }
  console.log(`Done: ${counts.copied} ${dryRun ? 'to copy' : 'copied'}, ${counts.present} already in the bucket, ${counts.missingLocally} missing locally.`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
