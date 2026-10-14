// Worker thread entry point for ocrPool.js: renders and OCRs one document at a
// time, off the server's main thread.
const { parentPort } = require('worker_threads');
const { extractTextDirect, shutdown } = require('./textExtraction');

parentPort.on('message', async (msg) => {
  if (msg.type === 'shutdown') {
    await shutdown().catch(() => {});
    parentPort.close();
    return;
  }
  try {
    const result = await extractTextDirect(Buffer.from(msg.buffer), msg.mimeType);
    parentPort.postMessage({ id: msg.id, result });
  } catch (err) {
    parentPort.postMessage({ id: msg.id, error: err.message });
  }
});
