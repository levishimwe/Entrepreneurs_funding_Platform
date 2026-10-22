import { useEffect, useState } from 'react';
import ReasonDialog from '../../components/ReasonDialog';
import { AdminPage, DataTable, KeyValue, Pill } from '../../components/admin';

// Planned tiers (FR01): a non-functional placeholder. Every plan action opens
// "Coming soon". Nothing here collects or processes payment.
const PLANS = [
  { name: 'Community Partner', price: 'Free', status: 'current', features: 'Browse approved ventures, request introductions, confirm follow-ups and investments' },
  { name: 'Syndicate Pro', price: '$120 / month', status: 'planned', features: 'Saved searches and alerts, early access to showcases, advanced filters' },
  { name: 'Institutional Gateway', price: '$450 / month', status: 'planned', features: 'Team seats, dedicated liaison, portfolio exports' },
];

const FAQ = [
  ['Why is it free?', 'During the pilot every feature is free. The platform does not collect payment information, charge fees or process transactions.'],
  ['Future billing', 'Paid tiers are a possible future direction only and would need a payment provider and separate review before launch.'],
  ['Equity or fees', 'None. The platform records introductions and confirmed investment outcomes only.'],
];

export default function Billing() {
  const [soon, setSoon] = useState(null);
  useEffect(() => {
    document.title = 'Billing & plans · ALU Ventures';
  }, []);

  return (
    <AdminPage title="Billing & plans">
      <DataTable
        columns={[
          { key: 'name', label: 'Plan', render: (p) => <span className="font-medium">{p.name}</span> },
          { key: 'price', label: 'Price', render: (p) => p.price },
          { key: 'features', label: 'Includes', render: (p) => p.features },
          { key: 'status', label: 'Status', render: (p) => (p.status === 'current' ? <Pill tone="success">Current plan</Pill> : <Pill>Planned</Pill>) },
        ]}
        rows={PLANS}
        rowKey={(p) => p.name}
        actions={(p) =>
          p.status === 'planned' ? (
            <button type="button" className="adm-act" onClick={() => setSoon(p.name)}>
              Upgrade
            </button>
          ) : null
        }
      />
      <h2>Questions</h2>
      <KeyValue rows={FAQ} />

      <ReasonDialog
        open={Boolean(soon)}
        reason="none"
        title="Coming soon"
        description={`${soon} is a planned tier and is not available yet. ALU Ventures is free during the pilot and does not take payments.`}
        confirmLabel="Got it"
        onClose={() => setSoon(null)}
        onConfirm={async () => {}}
      />
    </AdminPage>
  );
}
