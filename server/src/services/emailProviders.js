// Email delivery over HTTPS (EMAIL_DRIVER=resend | brevo). Hosts such as
// Render's free tier block outbound SMTP ports (25, 465, 587), so Nodemailer
// cannot reach Gmail there; these providers use port 443 instead. They sit
// behind the same persistent outbox, so retries and the admin Email Outbox
// work unchanged.

// '"ALU Ventures" <ventures@example.org>' → { name, email }
function parseAddress(value) {
  const m = String(value || '').match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || undefined, email: m[2].trim() };
  return { email: String(value || '').trim() };
}

async function postJson(fetchImpl, url, headers, body, provider) {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'alu-ventures/1.0', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    // The provider's message helps the administrator (e.g. unverified sender);
    // it never contains the API key.
    let detail = text.slice(0, 300);
    try {
      const json = JSON.parse(text);
      detail = json.message || json.error?.message || json.name || detail;
    } catch {
      // keep the raw text
    }
    throw new Error(`${provider} rejected the email (HTTP ${res.status}): ${detail}`);
  }
  return text ? JSON.parse(text) : {};
}

// https://resend.com/docs/api-reference/emails/send-email
function resendSender({ apiKey, from }, fetchImpl = globalThis.fetch) {
  return {
    name: 'resend',
    async send({ to, subject, text, html }) {
      const sender = parseAddress(from);
      await postJson(
        fetchImpl,
        'https://api.resend.com/emails',
        { Authorization: `Bearer ${apiKey}` },
        { from: sender.name ? `${sender.name} <${sender.email}>` : sender.email, to: [to], subject, text, html },
        'Resend'
      );
      return { previewUrl: null };
    },
  };
}

// https://developers.brevo.com/reference/sendtransacemail
function brevoSender({ apiKey, from }, fetchImpl = globalThis.fetch) {
  return {
    name: 'brevo',
    async send({ to, subject, text, html }) {
      const sender = parseAddress(from);
      await postJson(
        fetchImpl,
        'https://api.brevo.com/v3/smtp/email',
        { 'api-key': apiKey },
        { sender, to: [{ email: to }], subject, textContent: text, htmlContent: html },
        'Brevo'
      );
      return { previewUrl: null };
    },
  };
}

module.exports = { resendSender, brevoSender, parseAddress, HTTP_PROVIDERS: { resend: resendSender, brevo: brevoSender } };
