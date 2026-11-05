// The email domains accepted for NEW graduate registrations. Existing
// accounts, admin/staff and investors are never checked against this list.

const DEFAULT_ALUMNI_DOMAINS = ['alumni.alustudent.com', 'alumni.alueducation.com'];

const clean = (value) =>
  String(value || '')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);

/**
 * ALUMNI_EMAIL_DOMAINS (comma-separated) wins; the older single
 * ALUMNI_EMAIL_DOMAIN is used only when the new one is not set; otherwise the
 * default list with both domains.
 */
function alumniDomainsFrom(vars = process.env) {
  const many = clean(vars.ALUMNI_EMAIL_DOMAINS);
  if (many.length) return [...new Set(many)];
  const one = clean(vars.ALUMNI_EMAIL_DOMAIN);
  if (one.length) return one.slice(0, 1);
  return [...DEFAULT_ALUMNI_DOMAINS];
}

// Exactly one of the domains after the LAST "@": look-alikes such as
// alumni.alustudent.com.evil.com, mail.alumni.alueducation.com,
// alumni.alueducation.co or alumni.alueducation.com@evil.com do not match.
function isAlumniEmail(address, domains) {
  const v = String(address || '').trim().toLowerCase();
  const at = v.lastIndexOf('@');
  return at > 0 && domains.includes(v.slice(at + 1));
}

const alumniEmailMessage = (domains) => `Use your ALU alumni email (${domains.map((d) => `name@${d}`).join(' or ')}).`;

module.exports = { DEFAULT_ALUMNI_DOMAINS, alumniDomainsFrom, isAlumniEmail, alumniEmailMessage };
