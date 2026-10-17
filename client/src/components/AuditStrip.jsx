import { Collapsed, EmptyRow, TableWrap } from './admin';

const VERB = {
  'opportunity.proposed': 'Submitted opportunity',
  'opportunity.edited': 'Edited opportunity',
  'opportunity.published': 'Published opportunity',
  'opportunity.closed': 'Closed applications',
  'opportunity.archived': 'Archived opportunity',
  'application.submitted': 'Received application',
  'application.shortlisted': 'Decision',
  'application.selected': 'Decision',
  'application.not_selected': 'Decision',
};
const RESULT = {
  'application.shortlisted': 'Shortlisted',
  'application.selected': 'Selected',
  'application.not_selected': 'Not selected',
};

const utc = (d) => `${new Date(d).toISOString().slice(0, 16).replace('T', ' ')} UTC`;

// Governance audit log (FR10): who did what, to whom, when, and why. Shown
// collapsed under a page's main table.
export default function AuditStrip({ title = 'History', entries }) {
  return (
    <Collapsed title={`${title}${entries ? ` (${entries.length})` : ''}`}>
      <TableWrap>
        <table className="adm-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Action</th>
              <th>Subject</th>
              <th>Result</th>
              <th>Reason</th>
              <th>Emailed</th>
            </tr>
          </thead>
          <tbody>
            {!entries && <EmptyRow colSpan={7}>Loading…</EmptyRow>}
            {entries?.length === 0 && <EmptyRow colSpan={7}>No recorded actions yet.</EmptyRow>}
            {entries?.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap">{utc(e.at)}</td>
                <td className="break-all">{e.actor?.email || 'system'}</td>
                <td>{VERB[e.action] || e.action}</td>
                <td>{e.subject}</td>
                <td className={e.action === 'application.not_selected' ? 'adm-bad' : undefined}>{RESULT[e.action] || ''}</td>
                <td className="adm-muted">{e.reason || ''}</td>
                <td>{RESULT[e.action] ? (e.notified ? 'yes' : 'no') : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </Collapsed>
  );
}
