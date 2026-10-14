// Worker-thread pool for page rendering and OCR. Both are CPU-heavy and would
// otherwise stall every other request on the server's single main thread.
// At most MAX_WORKERS documents (OCR_POOL_SIZE, default 1) are processed at
// once; a burst of uploads waits in the queue. Threads start on first use, so
// nothing OCR-related (pdf.js, canvas, Tesseract) is loaded until a document
// arrives. Each thread keeps its Tesseract engine warm while busy, and exits
// after OCR_IDLE_MS without work to give its memory back. An idle thread never
// keeps the process alive.
const path = require('path');
const { Worker } = require('worker_threads');
const env = require('../../config/env');

const MAX_WORKERS = env.ocr.poolSize;
const IDLE_MS = env.ocr.idleMs;
const WORKER_FILE = path.join(__dirname, 'extractionWorker.js');

const threads = []; // { worker, job, idleTimer }
const queue = []; // { buffer, mimeType, resolve, reject }
let nextId = 1;

function spawn() {
  const thread = { worker: new Worker(WORKER_FILE), job: null, idleTimer: null };
  thread.worker.unref();
  thread.worker.on('message', ({ id, result, error }) => {
    const { job } = thread;
    if (!job || job.id !== id) return;
    finish(thread);
    if (error) job.reject(new Error(error));
    else job.resolve(result);
  });
  const fail = (err) => {
    // A crashed thread fails only its own job; the next job gets a new thread.
    threads.splice(threads.indexOf(thread), 1);
    if (thread.job) thread.job.reject(err instanceof Error ? err : new Error(`OCR worker exited (${err}).`));
    thread.job = null;
    pump();
  };
  thread.worker.on('error', fail);
  thread.worker.on('exit', (code) => {
    if (threads.includes(thread)) fail(code);
  });
  threads.push(thread);
  return thread;
}

function finish(thread) {
  thread.job = null;
  thread.worker.unref();
  pump();
  if (!thread.job && IDLE_MS > 0) {
    thread.idleTimer = setTimeout(() => retire(thread), IDLE_MS);
    thread.idleTimer.unref();
  }
}

// Stops an idle thread so its Tesseract engine's memory is released.
function retire(thread) {
  if (thread.job || !threads.includes(thread)) return;
  threads.splice(threads.indexOf(thread), 1);
  thread.worker.postMessage({ type: 'shutdown' });
  setTimeout(() => thread.worker.terminate(), 5000).unref();
}

function pump() {
  while (queue.length) {
    const thread = threads.find((t) => !t.job) || (threads.length < MAX_WORKERS ? spawn() : null);
    if (!thread) return;
    const job = queue.shift();
    clearTimeout(thread.idleTimer);
    thread.job = job;
    // Keep the process alive while a job is in flight (e.g. a CLI script).
    thread.worker.ref();
    const bytes = Uint8Array.from(job.buffer);
    thread.worker.postMessage({ id: job.id, buffer: bytes, mimeType: job.mimeType }, [bytes.buffer]);
  }
}

function run(buffer, mimeType) {
  return new Promise((resolve, reject) => {
    queue.push({ id: nextId++, buffer, mimeType, resolve, reject });
    pump();
  });
}

async function shutdown() {
  const closing = threads.splice(0);
  closing.forEach((t) => clearTimeout(t.idleTimer));
  for (const job of queue.splice(0)) job.reject(new Error('OCR pool shut down.'));
  await Promise.all(
    closing.map(
      ({ worker }) =>
        new Promise((resolve) => {
          const timer = setTimeout(() => worker.terminate().then(resolve, resolve), 5000);
          worker.once('exit', () => {
            clearTimeout(timer);
            resolve();
          });
          worker.postMessage({ type: 'shutdown' });
        })
    )
  );
}

const stats = () => ({ threads: threads.length, busy: threads.filter((t) => t.job).length, queued: queue.length });

module.exports = { run, shutdown, stats, MAX_WORKERS };
