import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { formatDate } from '../../components/ui';
import { AdminPage, DataTable, Loading, Messages, Pill, SidePanel } from '../../components/admin';
import { EmptyNote, FieldGrid, InfoCard } from '../../components/detail';
import { BATCH_TONE, FormattedText, MessageComposer, QuotaNote, useQuota } from '../../components/messaging';

function MessagePanel({ id, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(() => {
    api
      .get(`/messages/${id}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);
  const retry = async () => {
    try {
      const { retried } = await api.post(`/messages/${id}/retry-failed`);
      setNotice(`${retried} failed ${retried === 1 ? 'email was' : 'emails were'} queued again.`);
      load();
    } catch (e) {
      setError(e.message);
    }
  };
  const m = data?.message;
  return (
    <SidePanel title={m ? m.subject : 'Message'} onClose={onClose}>
      <Messages notice={notice} error={error} />
      {!m ? (
        <Loading />
      ) : (
        <div className="space-y-4">
          <InfoCard title="Delivery" action={<Pill tone={BATCH_TONE[m.status]}>{m.statusLabel}</Pill>}>
            <FieldGrid
              fields={[
                ['Audience', m.audienceLabel],
                ['Recipients', String(m.recipientCount)],
                ['Sent', String(m.counts.sent)],
                ['Waiting', String(m.counts.pending)],
                ['Failed', String(m.counts.failed)],
                ['Sent by', m.sender ? m.sender.name : null],
                ['Created', formatDate(m.createdAt, true)],
              ]}
            />
          </InfoCard>
          <InfoCard title="Message">
            <div className="text-[14px] leading-[1.6] text-ink">
              <FormattedText text={m.body} />
            </div>
          </InfoCard>
          <InfoCard title="Failed recipients" action={data.failures.length > 0 && <button type="button" className="adm-btn" onClick={retry}>Retry failed</button>}>
            {data.failures.length === 0 ? (
              <EmptyNote>No failures.</EmptyNote>
            ) : (
              <ul className="divide-y divide-line">
                {data.failures.map((f) => (
                  <li key={f.id} className="py-2 text-[13px]">
                    <span className="block font-medium text-ink">{f.name || 'Unknown recipient'}</span>
                    <span className="block break-words text-muted">{f.error || 'No error recorded.'}</span>
                  </li>
                ))}
              </ul>
            )}
          </InfoCard>
        </div>
      )}
    </SidePanel>
  );
}

// Staff and administrators: email all graduates, all investors and sponsors,
// or selected people. Emails are queued (never sent inside the request) and
// respect the provider's daily limit.
export default function SendMessage() {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [quota, loadQuota] = useQuota();

  const load = useCallback(() => {
    api
      .get('/messages')
      .then((d) => setList(d.messages))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    document.title = 'Send message · ALU Ventures';
    load();
  }, [load]);

  const send = async (payload) => {
    setBusy(true);
    setNotice('');
    try {
      const res = await api.post('/messages', payload);
      setNotice(`Queued for ${res.recipients} ${res.recipients === 1 ? 'person' : 'people'}. You can follow delivery under Sent messages.`);
      load();
      loadQuota();
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminPage title="Send message">
      <Messages notice={notice} error={error} />
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <InfoCard title="New message">
          <MessageComposer onSend={send} busy={busy} intro={<QuotaNote quota={quota} />} />
        </InfoCard>
        <section aria-label="Sent messages" className="min-w-0">
          <h2 className="mb-3 text-[15px] font-semibold text-ink">Sent messages</h2>
          {!list ? (
            <Loading />
          ) : (
            <DataTable
              rows={list}
              empty="No messages sent yet."
              columns={[
                { key: 'subject', label: 'Subject', render: (m) => <span className="font-medium">{m.subject}</span> },
                { key: 'audience', label: 'Audience', render: (m) => m.audienceLabel },
                { key: 'count', label: 'Recipients', render: (m) => m.recipientCount },
                { key: 'status', label: 'Status', render: (m) => <Pill tone={BATCH_TONE[m.status]}>{m.statusLabel}</Pill> },
                { key: 'sender', label: 'Sent by', render: (m) => m.sender?.name || '—' },
                { key: 'date', label: 'Date', render: (m) => formatDate(m.createdAt, true) },
              ]}
              actions={(m) => (
                <button type="button" className="adm-act" onClick={() => setViewing(m.id)}>
                  View
                </button>
              )}
            />
          )}
        </section>
      </div>
      {viewing && <MessagePanel id={viewing} onClose={() => setViewing(null)} />}
    </AdminPage>
  );
}
