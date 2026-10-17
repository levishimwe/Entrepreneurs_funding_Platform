import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import DocumentViewer from './DocumentViewer';
import { StatusText } from './admin';

const METHOD = {
  'pdf-text+ocr': 'PDF text layer + OCR',
  'pdf-text': 'PDF text',
  'pdf-ocr': 'Scanned PDF (OCR)',
  'image-ocr': 'Image (OCR)',
};

export const adminFileUrl = (id) => `/api/admin/documents/${id}/file`;

// Plain result text for one check.
function result(check) {
  if (check.neutral) return <span className="adm-muted">Note</span>;
  return check.passed ? 'Passed' : <span className="adm-bad">Failed</span>;
}

const POLL_MS = 3000;

// Administrator review block: the uploaded document (served only through the
// admin endpoint) above its automated checks. The flag is a review aid; the
// administrator decides.
export default function VerificationChecks({ document: initial, title }) {
  const [document, setDocument] = useState(initial);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setDocument(initial), [initial]);

  // Checks run in the background (OCR can outlast a proxy's timeout), so while
  // a document is processing the panel polls for the result.
  const processing = document?.status === 'processing';
  const id = document?.id;
  useEffect(() => {
    if (!processing || !id) return undefined;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const res = await api.get(`/admin/documents/${id}`);
        if (!cancelled && res.document.status !== 'processing') setDocument((d) => ({ ...d, ...res.document }));
      } catch {
        // Try again on the next tick.
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [processing, id]);

  if (!document) return <p className="text-sm text-muted">No document uploaded.</p>;
  const pending = !document.flag && processing;
  const rerunning = requesting || (processing && Boolean(document.flag));

  const rerun = async () => {
    setRequesting(true);
    setError('');
    try {
      const res = await api.post(`/admin/documents/${document.id}/reverify`);
      setDocument((d) => ({ ...d, ...res.document, status: 'processing' }));
    } catch (e) {
      setError(e.message);
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="space-y-3">
      <DocumentViewer src={adminFileUrl(document.id)} mimeType={document.mimeType} name={document.originalName} />
      <p>
        <span className="font-semibold">{title}</span>
        {' · Automated flag: '}
        <StatusText status={pending || rerunning ? 'processing' : document.flag} />
        {!pending && (
          <span className="adm-muted">
            {' · Read via '}
            {METHOD[document.method] || 'n/a'}
            {document.ocrConfidence != null && `, OCR confidence ${document.ocrConfidence}%`}
          </span>
        )}
      </p>
      {pending ? (
        <p className="adm-muted">The automated check is still running. This updates when it finishes.</p>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Check</th>
                <th>Result</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {document.checks.map((c) => (
                <tr key={c.id}>
                  <td>{c.label}</td>
                  <td className="whitespace-nowrap">{result(c)}</td>
                  <td className="adm-muted break-words">{c.detail || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="adm-hint">
        Automated checks never approve on their own. Compare them with the document before deciding.{' '}
        <button type="button" className="adm-btn" onClick={rerun} disabled={rerunning || pending}>
          {rerunning ? 'Re-running checks…' : 'Re-run checks'}
        </button>
      </p>
      {error && <p className="adm-bad">{error}</p>}
    </div>
  );
}
