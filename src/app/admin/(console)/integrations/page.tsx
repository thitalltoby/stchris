import { requireStaff } from '@/server/rbac';
import { listIntegrations } from '@/server/integrations';
import { PageHeader, Badge, Alert } from '@/components/ui';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { fmtDateTime } from '@/lib/format';
import type { ConfigField } from '@/server/integrations/core';
import { saveIntegrationAction, testIntegrationAction } from './actions';

export const metadata = { title: 'Integrations' };

const GROUPS: { title: string; blurb: string; keys: string[] }[] = [
  { title: 'Email', blurb: 'How the platform sends its own email.', keys: ['email'] },
  { title: 'Customer messages', blurb: 'Optional channels. A customer only receives a message if they ticked the box on that request.', keys: ['sms', 'whatsapp'] },
  { title: 'Website', blurb: 'Affects the public site only.', keys: ['analytics'] },
  { title: 'Business systems', blurb: 'Connect St. Chris’s other tools. The webhook sends signed events; the others call a REST API using a mapping you write.', keys: ['webhook', 'crm', 'accounting', 'dispatch', 'stock', 'documents'] },
];

const showForHint = (f: ConfigField, all: ConfigField[]) => {
  if (!f.showFor) return undefined;
  const ctl = all.find((x) => x.key === f.showFor!.key);
  const names = f.showFor.values.map((v) => ctl?.options?.find((o) => o.value === v)?.label ?? v);
  return `Used when ${ctl?.label.toLowerCase() ?? f.showFor.key} is ${names.join(' or ')}.`;
};
const testLabel = (key: string) => (key === 'email' ? 'Send a test email to me' : key === 'sms' || key === 'whatsapp' ? 'Send a test message' : 'Run a test');

export default async function IntegrationsPage() {
  const user = await requireStaff('integration.manage');
  const items = await listIntegrations(user);
  const mail = items[0]?.emailProvider ?? { name: 'none', source: 'none' };
  const byKey = new Map(items.map((i) => [i.adapter.key, i]));
  return (
    <>
      <PageHeader title="Integrations" eyebrow="Connections to other systems"><p>Every connector below is built into the platform and switched on from here with St. Chris’s own credentials. A connector is shown as verified only after its test has passed with those credentials; until then it is “built, not yet verified”.</p></PageHeader>
      <div className="mb-8">
        <Alert tone={mail.name === 'none' ? 'warn' : 'ok'}>
          <strong>Email right now:</strong> {mail.name === 'none' ? 'no provider is configured, so messages are recorded in the outbox as “skipped” and are not delivered. Set one up under “Email delivery” below.' : `sent through ${mail.name}${mail.source === 'console' ? ' (settings saved here)' : ' (server environment settings)'}.`}
        </Alert>
      </div>
      <div className="space-y-12">
        {GROUPS.map((g) => (
          <section key={g.title} aria-labelledby={`g-${g.title}`}>
            <h2 id={`g-${g.title}`} className="!text-xl">{g.title}</h2>
            <p className="text-steel text-sm mt-1 mb-4 max-w-2xl">{g.blurb}</p>
            <div className="grid gap-5 xl:grid-cols-2">
              {g.keys.map((k) => byKey.get(k)).filter((i): i is NonNullable<typeof i> => !!i).map((i) => (
                <section key={i.adapter.key} className="panel panel-pad" aria-label={i.adapter.name}>
                  <div className="flex justify-between gap-3 items-start">
                    <h3 className="!text-lg">{i.adapter.name}</h3>
                    {i.enabled ? <Badge tone={i.lastStatus === 'OK' ? 'good' : 'warn'}>{i.lastStatus === 'OK' ? 'On, last test passed' : 'On, not yet verified'}</Badge> : <Badge>Built, off</Badge>}
                  </div>
                  <p className="text-sm text-steel mt-2">{i.adapter.purpose}</p>
                  {i.adapter.verification && <p className="text-sm mt-3 border-l-2 border-brand pl-3">{i.adapter.verification}</p>}
                  <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium">Needed from St. Chris</summary><ul className="list-disc ml-5 mt-2 space-y-1">{i.adapter.requirements.map((r) => <li key={r}>{r}</li>)}</ul></details>
                  <ActionForm action={saveIntegrationAction} className="mt-5 space-y-4"><input type="hidden" name="key" value={i.adapter.key} />
                    {i.adapter.fields.map((f) => (
                      <div key={f.key}>
                        <Field
                          name={`f_${f.key}`} label={f.label}
                          type={f.type === 'textarea' ? 'textarea' : f.type === 'select' ? 'select' : f.type === 'checkbox' ? 'checkbox' : f.type === 'number' ? 'number' : f.secret ? 'password' : 'text'}
                          options={f.options} rows={f.type === 'textarea' ? 10 : undefined}
                          defaultValue={f.secret ? '' : f.type === 'checkbox' ? (i.config[f.key] === 'true' || i.config[f.key] === 'on') : (i.config[f.key] ?? (f.type === 'select' ? f.options?.[0]?.value : ''))}
                          placeholder={f.secret && i.secretsSet[f.key] ? '•••••• stored (leave blank to keep)' : f.placeholder}
                          hint={[f.help, showForHint(f, i.adapter.fields)].filter(Boolean).join(' ') || undefined}
                          autoComplete={f.secret ? 'new-password' : 'off'}
                        />
                        {f.example && <details className="mt-2 text-sm"><summary className="cursor-pointer">Show an example mapping</summary><pre className="mono text-xs bg-white border border-line p-3 mt-2 overflow-x-auto whitespace-pre-wrap">{f.example}</pre></details>}
                      </div>
                    ))}
                    {i.adapter.events.length > 0 && (
                      <fieldset><legend className="label">Send these events</legend><div className="space-y-1">{i.adapter.events.map((e) => <label key={e} className="check"><input type="checkbox" name={`e_${e}`} defaultChecked={(i.config.events ?? i.adapter.events).includes(e)} /><span className="mono text-sm">{e}</span></label>)}</div></fieldset>
                    )}
                    <Field name="enabled" type="checkbox" label="Switched on" defaultValue={i.enabled} />
                    <SubmitButton className="btn btn-primary btn-sm">Save</SubmitButton>
                  </ActionForm>
                  {i.adapter.test && (
                    <ActionForm action={testIntegrationAction} className="mt-3"><input type="hidden" name="key" value={i.adapter.key} /><SubmitButton className="btn btn-dark btn-sm" pending="Testing…">{testLabel(i.adapter.key)}</SubmitButton><p className="hint mt-1">Uses the saved settings. Save first, then test.</p></ActionForm>
                  )}
                  {i.lastCheckedAt && <p className="hint mt-3">Last test {fmtDateTime(i.lastCheckedAt)}: {i.lastMessage}</p>}
                  {i.logs.length > 0 && <details className="mt-3 text-sm"><summary className="cursor-pointer">Recent activity</summary><ul className="mt-2 space-y-1">{i.logs.map((l) => <li key={l.id} className="mono text-xs">{fmtDateTime(l.createdAt)} · {l.event} · {l.status}{l.responseSummary ? ` · ${l.responseSummary.slice(0, 100)}` : ''}{l.error ? ` · ${l.error.slice(0, 100)}` : ''}</li>)}</ul></details>}
                </section>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
