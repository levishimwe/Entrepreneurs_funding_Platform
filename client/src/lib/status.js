// Display labels and pill colours for every status in the system, matching
// the Figma status pills: green = approved/valid, amber = pending/flagged,
// red = suspicious/rejected, blue = in progress, slate = neutral/closed.
const T = {
  green: 'green',
  amber: 'amber',
  red: 'red',
  blue: 'blue',
  purple: 'purple',
  slate: 'slate',
};

export const STATUS = {
  // Projects (proposal status list)
  pending_review: { label: 'Pending Review', tone: T.amber },
  revision_required: { label: 'Revision Required', tone: T.blue },
  similarity_flagged: { label: 'Similarity Flagged', tone: T.purple },
  approved: { label: 'Approved and Seeking Investment', tone: T.green },
  funded: { label: 'Fully Funded', tone: T.green },
  investor_limit_reached: { label: 'Investor Limit Reached', tone: T.blue },
  rejected: { label: 'Rejected', tone: T.red },
  archived: { label: 'Archived', tone: T.slate },

  // Accounts
  pending_email: { label: 'Email Unverified', tone: T.slate },
  active: { label: 'Approved', tone: T.green },
  suspended: { label: 'Suspended', tone: T.red },

  // OCR pre-check flags
  likely_valid: { label: 'Likely Valid', tone: T.green },
  suspicious: { label: 'Suspicious', tone: T.red },
  processing: { label: 'Checking…', tone: T.slate },

  // Introductions
  requested: { label: 'Awaiting Graduate', tone: T.amber },
  accepted: { label: 'Introduced', tone: T.green },
  declined: { label: 'Declined', tone: T.slate },

  // Applications
  submitted: { label: 'Submitted', tone: T.blue },
  shortlisted: { label: 'Shortlisted', tone: T.purple },
  selected: { label: 'Selected', tone: T.green },
  not_selected: { label: 'Not Selected', tone: T.slate },

  // Opportunities
  published: { label: 'Published', tone: T.green },
  closed: { label: 'Closed', tone: T.slate },

  // Outbox
  pending: { label: 'Pending', tone: T.amber },
  sent: { label: 'Sent', tone: T.green },
  failed: { label: 'Failed', tone: T.red },

  // Similarity
  flagged: { label: 'Flagged', tone: T.purple },
  clarified: { label: 'Clarified', tone: T.blue },
  cleared: { label: 'Cleared', tone: T.green },

  // Project type
  idea: { label: 'Idea Stage', tone: T.slate },
  company: { label: 'Registered Company', tone: T.blue },
};

export const statusLabel = (status) => STATUS[status]?.label || String(status || '').replace(/_/g, ' ');
export const statusTone = (status) => STATUS[status]?.tone || T.slate;
