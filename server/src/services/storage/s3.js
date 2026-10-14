// S3-compatible storage driver (Cloudflare R2, Hetzner Object Storage, AWS
// S3). Objects are written without any public ACL, so the bucket stays
// private: files are only ever read here and streamed to an authorised user
// through the API (services/fileDelivery.js). No public or presigned URLs.
const crypto = require('crypto');

const EXTENSIONS = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg' };
const KEY = /^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*\/[0-9a-f-]{36}\.(?:pdf|png|jpg|bin)$/;

function checkKey(key) {
  if (typeof key !== 'string' || !KEY.test(key)) throw new Error('Invalid storage key');
  return key;
}

const isNotFound = (err) => err?.name === 'NoSuchKey' || err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404;

async function toBuffer(body) {
  if (!body) return Buffer.alloc(0);
  if (typeof body.transformToByteArray === 'function') return Buffer.from(await body.transformToByteArray());
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/**
 * @param {{bucket: string, endpoint?: string, region?: string, accessKeyId: string,
 *   secretAccessKey: string, forcePathStyle?: boolean}} config
 * @param {{client?: {send: Function}}} [deps] tests pass a fake client
 */
function s3Driver(config, { client } = {}) {
  const missing = ['bucket', 'accessKeyId', 'secretAccessKey'].filter((k) => !config[k]);
  if (missing.length && !client) {
    const names = { bucket: 'S3_BUCKET', accessKeyId: 'S3_ACCESS_KEY_ID', secretAccessKey: 'S3_SECRET_ACCESS_KEY' };
    throw new Error(`STORAGE_DRIVER=s3 needs ${missing.map((k) => names[k]).join(', ')}.`);
  }
  const sdk = require('@aws-sdk/client-s3');
  const s3 =
    client ||
    new sdk.S3Client({
      region: config.region || 'auto',
      endpoint: config.endpoint || undefined,
      forcePathStyle: Boolean(config.forcePathStyle),
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  const Bucket = config.bucket;

  return {
    async put(buffer, { prefix, mimeType }) {
      const key = checkKey(`${prefix}/${crypto.randomUUID()}.${EXTENSIONS[mimeType] || 'bin'}`);
      await s3.send(
        new sdk.PutObjectCommand({
          Bucket,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
          ContentLength: buffer.length,
        })
      );
      return key;
    },
    // Copies an existing object under a known key (scripts/copy-uploads-to-s3.js).
    async putAt(key, buffer, mimeType) {
      await s3.send(new sdk.PutObjectCommand({ Bucket, Key: checkKey(key), Body: buffer, ContentType: mimeType, ContentLength: buffer.length }));
      return key;
    },
    async get(key) {
      try {
        const res = await s3.send(new sdk.GetObjectCommand({ Bucket, Key: checkKey(key) }));
        return toBuffer(res.Body);
      } catch (err) {
        if (isNotFound(err)) {
          const missing = new Error('Stored file not found');
          missing.code = 'ENOENT';
          throw missing;
        }
        throw err;
      }
    },
    async remove(key) {
      await s3.send(new sdk.DeleteObjectCommand({ Bucket, Key: checkKey(key) }));
    },
    async exists(key) {
      try {
        await s3.send(new sdk.HeadObjectCommand({ Bucket, Key: checkKey(key) }));
        return true;
      } catch (err) {
        if (isNotFound(err)) return false;
        throw err;
      }
    },
  };
}

module.exports = { s3Driver, checkKey };
