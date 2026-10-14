// Client mirror of the server's project transition table (routes/admin.js).
// The server remains the authority; this only decides which buttons to show.
// There is deliberately no Delete and no manual "Close Discovery".
export const ARCHIVE_NOTICE =
  'This project will be removed from active investor discovery, but its project, introduction and funding history will be retained.';

export const PROJECT_ACTIONS = {
  approve: {
    label: 'Approve',
    tone: 'success',
    from: ['pending_review', 'similarity_flagged'],
    reason: 'optional',
    title: 'Approve this project?',
    description: 'It becomes Approved and Seeking Investment and, with the founder’s consent, publicly verifiable by its code.',
  },
  clear_similarity: {
    label: 'Clear similarity flag',
    tone: 'primary',
    from: ['similarity_flagged'],
    reason: 'optional',
    title: 'Clear the similarity flag?',
    description: 'The clarification is accepted and the project returns to Pending Review.',
  },
  request_revision: {
    label: 'Request Revision',
    tone: 'primary',
    from: ['pending_review', 'similarity_flagged', 'approved'],
    reason: 'required',
    reasonLabel: 'What should the graduate change?',
    title: 'Request a revision?',
    description: 'The graduate is emailed your note and can revise and resubmit. The project code stays the same.',
  },
  reject: {
    label: 'Reject',
    tone: 'danger',
    from: ['pending_review', 'similarity_flagged', 'revision_required'],
    reason: 'required',
    title: 'Reject this project?',
    description: 'The graduate is emailed your reason. The record is kept.',
  },
  mark_funded: {
    label: 'Mark as Funded',
    tone: 'success',
    from: ['approved', 'investor_limit_reached'],
    reason: 'optional',
    title: 'Mark as Fully Funded?',
    description: 'Only record this after the graduate and an investor have both confirmed the investment. The project leaves active investor discovery.',
  },
  archive: {
    label: 'Archive',
    tone: 'danger',
    from: ['pending_review', 'similarity_flagged', 'revision_required', 'approved', 'funded', 'investor_limit_reached', 'rejected'],
    reason: 'optional',
    title: 'Archive this project?',
    description: ARCHIVE_NOTICE,
  },
  restore: {
    label: 'Restore',
    tone: 'primary',
    from: ['archived'],
    reason: 'optional',
    title: 'Restore this project?',
    description: 'It returns to the status it had before it was archived.',
  },
};

// Returns [key, action, disabledReason] for every action valid in this state.
export function availableActions(project) {
  return Object.entries(PROJECT_ACTIONS)
    .filter(([, a]) => a.from.includes(project.status))
    .map(([key, a]) => {
      let disabled = null;
      if (['approve', 'clear_similarity'].includes(key) && project.status === 'similarity_flagged' && project.similarityStatus !== 'clarified') {
        disabled = 'Waiting for the graduate’s clarification.';
      }
      if (key === 'mark_funded' && !project.confirmedInvestors) {
        disabled = 'Needs an investment confirmed by both the graduate and an investor.';
      }
      return [key, a, disabled];
    });
}
