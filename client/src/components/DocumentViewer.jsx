import { useEffect, useRef, useState } from 'react';
import { ExternalLink, FileWarning, Minus, Plus } from 'lucide-react';
import { Spinner } from './ui';

// Inline preview of a private document for review. The file is fetched with
// the session cookie from an authenticated endpoint (no public URL); PDFs are
// drawn with pdf.js into canvases so the preview works in every browser,
// including mobile browsers that cannot show PDFs inside a page.
let pdfjsPromise = null;
async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(
      ([pdfjs, worker]) => {
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        return pdfjs;
      }
    );
  }
  return pdfjsPromise;
}

const MAX_PAGES = 10;

function PdfPages({ data, zoom }) {
  const containerRef = useRef(null);
  const [pageCount, setPageCount] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let doc = null;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        doc = await pdfjs.getDocument({ data: data.slice(0), isEvalSupported: false }).promise;
        if (cancelled) return;
        setPageCount(doc.numPages);
        const container = containerRef.current;
        container.replaceChildren();
        const width = container.clientWidth || 600;
        for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n += 1) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = (width / base.width) * zoom;
          const viewport = page.getViewport({ scale: scale * (window.devicePixelRatio || 1) });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${(viewport.width / (window.devicePixelRatio || 1)).toFixed(0)}px`;
          canvas.className = 'mx-auto mb-3 block max-w-none bg-white shadow-sm ring-1 ring-line';
          canvas.setAttribute('aria-label', `Page ${n}`);
          container.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport, canvas }).promise;
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'This PDF could not be displayed.');
      }
    })();
    return () => {
      cancelled = true;
      doc?.destroy?.();
    };
  }, [data, zoom]);

  if (error) {
    return (
      <p className="flex items-center gap-2 p-4 text-sm text-red-600">
        <FileWarning className="h-4 w-4" aria-hidden="true" /> {error}
      </p>
    );
  }
  return (
    <>
      <div ref={containerRef} className="min-h-40" />
      {pageCount > MAX_PAGES && <p className="pb-2 text-center text-xs text-muted">Showing the first {MAX_PAGES} of {pageCount} pages.</p>}
    </>
  );
}

export default function DocumentViewer({ src, mimeType, name, height = 'h-[32rem]' }) {
  const [state, setState] = useState({ loading: true, error: '', data: null, url: null });
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let url = null;
    let cancelled = false;
    setState({ loading: true, error: '', data: null, url: null });
    fetch(src, { credentials: 'same-origin' })
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 404 ? 'Document not found.' : 'You do not have access to this document.');
        const blob = await res.blob();
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setState({ loading: false, error: '', data: new Uint8Array(await blob.arrayBuffer()), url });
      })
      .catch((err) => !cancelled && setState({ loading: false, error: err.message, data: null, url: null }));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [src]);

  const isPdf = mimeType === 'application/pdf';
  return (
    <div className="flex flex-col overflow-hidden rounded-md border border-line bg-subtle">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-surface px-3 py-1.5">
        <span className="min-w-0 truncate text-xs text-muted" title={name}>
          {name}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {isPdf && (
            <>
              <button type="button" className="rounded p-1 text-muted hover:bg-subtle" onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))} aria-label="Zoom out">
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-10 text-center text-xs tabular-nums text-muted">{Math.round(zoom * 100)}%</span>
              <button type="button" className="rounded p-1 text-muted hover:bg-subtle" onClick={() => setZoom((z) => Math.min(2.4, z + 0.2))} aria-label="Zoom in">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <a href={src} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-accent hover:bg-subtle">
            Open in new tab <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </div>
      </div>
      <div className={`${height} overflow-auto p-3`}>
        {state.loading && <Spinner label="Loading document…" />}
        {state.error && (
          <p className="flex items-center gap-2 text-sm text-red-600">
            <FileWarning className="h-4 w-4" aria-hidden="true" /> {state.error}
          </p>
        )}
        {state.data && (isPdf ? <PdfPages data={state.data} zoom={zoom} /> : <img src={state.url} alt={name} className="mx-auto max-w-full bg-white shadow-sm ring-1 ring-line" style={{ width: `${zoom * 100}%` }} />)}
      </div>
    </div>
  );
}
