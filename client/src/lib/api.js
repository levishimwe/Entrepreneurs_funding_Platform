// Thin fetch wrapper. The session lives in an HttpOnly cookie; every request
// carries the custom header the API requires as CSRF protection.
export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || 'Something went wrong. Please try again.');
    this.status = status;
    this.fields = body?.fields || {};
    // Some responses (e.g. SIMILARITY_WARNING) carry their data at the top level.
    this.details = body?.details ?? (body?.code ? body : undefined);
  }
}

async function request(method, url, body, { isForm = false } = {}) {
  const headers = { 'X-Requested-With': 'fetch' };
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(`/api${url}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, { error: 'Cannot reach the server. Check your connection and try again.' });
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  patch: (url, body = {}) => request('PATCH', url, body),
  put: (url, body = {}) => request('PUT', url, body),
  delete: (url) => request('DELETE', url),
  upload: (url, formData, method = 'POST') => request(method, url, formData, { isForm: true }),
};

// Builds a query string, skipping empty values.
export function qs(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') search.set(k, v);
  });
  const s = search.toString();
  return s ? `?${s}` : '';
}
