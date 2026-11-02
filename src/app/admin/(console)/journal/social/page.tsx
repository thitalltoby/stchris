import { requireStaff } from '@/server/rbac';
import { can } from '@/lib/permissions';
import { listAccounts, listSocialLog, articleUrl } from '@/server/social';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { CopyLink } from '@/components/CopyLink';
import { PageHeader, Badge, Alert, Empty } from '@/components/ui';
import { connectAccountAction, accountAction, postAction } from '../actions';
import { composePost, SPECS, type Platform } from '@/lib/journal';
import { fmtDateTime } from '@/lib/format';

export const metadata = { title: 'Social accounts and queue' };

const POST_TONE: Record<string, 'neutral' | 'info' | 'warn' | 'good' | 'bad'> = { PENDING: 'neutral', QUEUED: 'info', PUBLISHED: 'good', FAILED: 'bad', NEEDS_MANUAL: 'warn', CANCELLED: 'neutral' };
const POST_LABEL: Record<string, string> = { PENDING: 'Waiting for the article', QUEUED: 'Sending', PUBLISHED: 'Posted', FAILED: 'Failed', NEEDS_MANUAL: 'Post by hand', CANCELLED: 'Cancelled' };
const HELP: Record<string, string> = {
  linkedin: 'The person or organisation address, for example urn:li:person:… or urn:li:organization:…, and an access token with the w_member_social (or w_organization_social) permission from a LinkedIn developer app.',
  facebook: 'The Page ID, and a Page access token with permission to publish to the Page, from a Meta developer app.',
  instagram: 'The Instagram business account ID (linked to a Facebook Page), and an access token with the instagram_content_publish permission. Instagram needs a picture and a public JPEG address.',
  x: 'Your X user ID, and an OAuth 2.0 user access token with the tweet.write permission from an X developer app.',
};

export default async function SocialAdmin() {
  const user = await requireStaff('social.publish').catch(async () => requireStaff('social.manage'));
  const manage = can(user.role, 'social.manage');
  const [accounts, log] = await Promise.all([listAccounts(), listSocialLog({ take: 120 })]);
  const todo = log.filter((p) => p.status === 'NEEDS_MANUAL' || p.status === 'FAILED');
  return (
    <>
      <PageHeader title="Social accounts and queue" eyebrow="Journal">
        <p>What goes out, what needs a person, and the accounts it goes through. Automatic posting works only where the platform allows it and the account is connected; everything else is put on the list below.</p>
      </PageHeader>

      <section aria-labelledby="todo-h" className="mb-10">
        <h2 id="todo-h" className="!text-xl mb-3">Needs your attention {todo.length > 0 && <Badge tone="warn">{todo.length}</Badge>}</h2>
        {todo.length === 0 ? <Empty title="Nothing waiting">Posts that fail, or that cannot be sent automatically, appear here with the text ready to copy.</Empty> : (
          <ul className="space-y-4">
            {todo.map((p) => {
              const platform = p.account.platform as Platform;
              const composed = composePost(platform, { caption: p.caption, hashtags: p.hashtags as string[], url: articleUrl(p.article.slug), includeLink: p.includeLink });
              return (
                <li key={p.id} className="panel panel-pad">
                  <div className="flex flex-wrap items-center gap-2"><Badge tone={POST_TONE[p.status]}>{POST_LABEL[p.status]}</Badge><span className="font-semibold">{p.account.displayName}</span><span className="text-steel text-sm">· {SPECS[platform].label} · {p.article.title}</span></div>
                  {(p.note || p.error) && <p className="mt-2 text-sm text-ember font-medium">{p.note ?? p.error}</p>}
                  <pre className="mt-3 bg-paper-2 p-3 text-sm whitespace-pre-wrap break-words font-sans">{composed.text}</pre>
                  <div className="mt-3 flex flex-wrap gap-2 items-center">
                    <CopyLink url={composed.text} label="Copy the text" doneLabel="Text copied" />
                    <a className="btn btn-outline btn-sm" href={SPECS[platform].composer(composed.text, articleUrl(p.article.slug))} target="_blank" rel="noopener noreferrer">Open {SPECS[platform].label}<span className="sr-only"> (new tab)</span></a>
                    <ActionForm action={postAction} className="inline"><input type="hidden" name="id" value={p.id} /><input type="hidden" name="op" value="retry" /><SubmitButton className="btn btn-dark btn-sm">Try automatic posting again</SubmitButton></ActionForm>
                  </div>
                  <ActionForm action={postAction} className="mt-3 flex flex-wrap gap-2 items-end">
                    <input type="hidden" name="id" value={p.id} /><input type="hidden" name="op" value="posted" />
                    <Field name="url" label="After posting by hand: address of the post (optional)" placeholder="https://" className="min-w-[16rem] flex-1" />
                    <SubmitButton className="btn btn-primary btn-sm">Mark as posted</SubmitButton>
                  </ActionForm>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="acc-h" className="mb-10">
        <h2 id="acc-h" className="!text-xl mb-3">Connected accounts</h2>
        {accounts.length === 0 ? <Empty title="No accounts connected">{manage ? 'Connect one below. Until then, posts are prepared and put on the list to post by hand.' : 'Someone with access to social accounts can connect them.'}</Empty> : (
          <div className="table-wrap"><table className="dt"><thead><tr><th>Account</th><th>Platform</th><th>Mode</th><th>Status</th><th>Last checked</th>{manage && <th>Actions</th>}</tr></thead><tbody>
            {accounts.map((a) => (
              <tr key={a.id}>
                <td><span className="font-medium">{a.displayName}</span><br /><span className="mono text-xs text-steel">{a.externalId}</span></td>
                <td>{SPECS[a.platform as Platform]?.label ?? a.platform}</td>
                <td>{a.mode === 'AUTO' ? 'Automatic' : 'I post by hand'}</td>
                <td><Badge tone={a.status === 'CONNECTED' ? 'good' : a.status === 'DISABLED' ? 'neutral' : 'bad'}>{a.status === 'CONNECTED' ? 'Connected' : a.status === 'DISABLED' ? 'Switched off' : 'Needs attention'}</Badge>{a.lastError && <p className="text-xs text-ember mt-1 max-w-xs">{a.lastError}</p>}</td>
                <td className="text-sm">{a.lastCheckedAt ? fmtDateTime(a.lastCheckedAt) : '—'}</td>
                {manage && (
                  <td>
                    <div className="flex flex-wrap gap-1.5">
                      {([['verify', 'Check'], [a.mode === 'AUTO' ? 'manual' : 'auto', a.mode === 'AUTO' ? 'Post by hand' : 'Automatic'], [a.status === 'DISABLED' ? 'enable' : 'disable', a.status === 'DISABLED' ? 'Switch on' : 'Switch off'], ['disconnect', 'Disconnect']] as const).map(([op, label]) => (
                        <ActionForm key={op} action={accountAction} className="inline"><input type="hidden" name="id" value={a.id} /><input type="hidden" name="op" value={op} /><SubmitButton className={op === 'disconnect' ? 'btn btn-danger btn-sm' : 'btn btn-outline btn-sm'}>{label}</SubmitButton></ActionForm>
                      ))}
                    </div>
                    <details className="mt-2"><summary className="cursor-pointer text-sm text-ember">Replace token</summary><ActionForm action={accountAction} className="mt-2 flex gap-2 items-end"><input type="hidden" name="id" value={a.id} /><input type="hidden" name="op" value="token" /><Field name="token" label="New access token" type="password" autoComplete="off" required className="flex-1" /><SubmitButton className="btn btn-dark btn-sm">Save</SubmitButton></ActionForm></details>
                  </td>
                )}
              </tr>
            ))}
          </tbody></table></div>
        )}
        {manage && (
          <details className="panel panel-pad mt-4"><summary className="cursor-pointer font-display font-bold min-h-[2.75rem] flex items-center">Connect an account</summary>
            <ActionForm action={connectAccountAction} resetOnSuccess className="mt-4 grid gap-4 max-w-2xl">
              <Field name="platform" label="Platform" type="select" required options={Object.entries(SPECS).map(([k, v]) => ({ value: k, label: v.label }))} />
              <Field name="displayName" label="Name for this account" required placeholder="Chris Iyoha, LinkedIn" />
              <Field name="externalId" label="Account, page or organisation identifier" required />
              <Field name="mode" label="How should posts go out?" type="select" options={[{ value: 'AUTO', label: 'Automatically (needs an access token)' }, { value: 'MANUAL', label: 'I post by hand (the system prepares the text and tells me)' }]} defaultValue="AUTO" />
              <Field name="token" label="Access token" type="password" autoComplete="off" hint="Stored encrypted and never shown again. Not needed when you post by hand." />
              <Field name="tokenExpiresOn" label="Token expires on (optional)" type="date" hint="Most platform tokens expire. Note the date so the account can be reconnected before it stops working." />
              <SubmitButton pending="Checking the connection…">Connect</SubmitButton>
            </ActionForm>
            <dl className="mt-6 text-sm text-steel space-y-2 max-w-2xl border-t border-line pt-4">
              <p className="font-semibold text-charcoal">What each platform needs</p>
              {Object.entries(HELP).map(([k, v]) => <div key={k}><dt className="font-semibold text-charcoal">{SPECS[k as Platform].label}</dt><dd>{v}</dd></div>)}
              <p>The connection is checked when you save it. Posting itself has been tested against simulated platforms; the first real post is the real proof, so start with a test article.</p>
            </dl>
          </details>
        )}
      </section>

      <section aria-labelledby="log-h">
        <h2 id="log-h" className="!text-xl mb-3">Publishing log</h2>
        {log.length === 0 ? <Empty title="Nothing posted yet" /> : (
          <div className="table-wrap"><table className="dt"><thead><tr><th>When</th><th>Article</th><th>Channel</th><th>Status</th><th>Tries</th><th>Detail</th></tr></thead><tbody>
            {log.map((p) => (
              <tr key={p.id}><td className="whitespace-nowrap text-sm">{fmtDateTime(p.publishedAt ?? p.updatedAt)}</td><td className="max-w-xs">{p.article.title}</td><td>{p.account.displayName}</td><td><Badge tone={POST_TONE[p.status]}>{POST_LABEL[p.status]}</Badge></td><td className="num">{p.attempts}</td><td className="text-sm max-w-sm">{p.externalUrl ? <a href={p.externalUrl} rel="noopener noreferrer">View post</a> : p.error ?? p.note ?? '—'}</td></tr>
            ))}
          </tbody></table></div>
        )}
      </section>
      <div className="mt-6"><Alert tone="info">Social metrics (likes, reach) are not collected here: each platform gives those only through its own analytics, and only with extra permissions. Use the platform’s own dashboard, or the links in the log above.</Alert></div>
    </>
  );
}
