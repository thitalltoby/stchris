'use client';

import { useEffect, useRef, useState } from 'react';
import { ActionForm, Field, SubmitButton } from './ActionForm';
import { PhotoPicker } from './PhotoPicker';
import { Icon } from './Icon';
import { composePost, normaliseHashtags, SPECS, type Platform } from '@/lib/journal';
import type { FormState } from '@/server/action-utils';

type Opt = { value: string; label: string };
export interface EditorAccount { id: string; platform: Platform; displayName: string; mode: string; status: string; lastError: string | null; post: { status: string; caption: string; hashtags: string[]; includeLink: boolean; error: string | null; note: string | null; externalUrl: string | null } | null }
export interface EditorArticle { id: string | null; title: string; subtitle: string; excerpt: string; body: string; categoryId: string; tags: string; featuredImageKey: string; featuredImageAlt: string; videoUrl: string; seoTitle: string; seoDescription: string; slug: string; status: string; scheduledFor: string; publishedAt: string | null }

const STATUS_LABEL: Record<string, string> = { DRAFT: 'Draft', SCHEDULED: 'Scheduled', PUBLISHED: 'Published', ARCHIVED: 'Removed from the site' };
const POST_LABEL: Record<string, string> = { PENDING: 'Will go out when published', QUEUED: 'Sending…', PUBLISHED: 'Posted', FAILED: 'Failed', NEEDS_MANUAL: 'Needs posting by hand', CANCELLED: 'Cancelled' };

function Tool({ label, icon, text, onClick }: { label: string; icon?: string; text?: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="btn btn-outline !min-h-[2.75rem] !min-w-[2.75rem] !px-2.5 font-bold" aria-label={label} title={label}>{icon ? <Icon name={icon} size={18} /> : text}</button>;
}

export function ArticleEditor({ action, article, categories, photos, accounts, canPublish, canSocial, siteUrl }: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>; article: EditorArticle; categories: Opt[]; photos: Opt[]; accounts: EditorAccount[]; canPublish: boolean; canSocial: boolean; siteUrl: string;
}) {
  const live = article.status === 'PUBLISHED';
  const body = useRef<HTMLTextAreaElement>(null);
  const [title, setTitle] = useState(article.title);
  const [excerpt, setExcerpt] = useState(article.excerpt);
  const [seoTitle, setSeoTitle] = useState(article.seoTitle);
  const [seoDesc, setSeoDesc] = useState(article.seoDescription);
  const [slug, setSlug] = useState(article.slug);
  const [restore, setRestore] = useState<Record<string, string> | null>(null);
  const [pic, setPic] = useState({ busy: false, err: '' });
  const key = `stchris:draft:${article.id ?? 'new'}`;
  const form = useRef<HTMLDivElement>(null);

  // A phone can discard a tab at any moment. Keep what has been typed, and offer it back if the page reloads before saving.
  /* eslint-disable react-hooks/set-state-in-effect -- the saved draft lives in the browser, so it can only be read after mount */
  useEffect(() => {
    try { const raw = localStorage.getItem(key); if (raw) { const d = JSON.parse(raw) as Record<string, string>; if ((d.body ?? '') !== article.body && (d.body ?? '').length > article.body.length) setRestore(d); } } catch { /* storage unavailable */ }
    const t = setInterval(() => {
      const el = body.current; if (!el) return;
      try { localStorage.setItem(key, JSON.stringify({ title: (document.getElementById('f-title') as HTMLInputElement | null)?.value ?? '', body: el.value })); } catch { /* ignore */ }
    }, 4000);
    return () => clearInterval(t);
  }, [key, article.body]);
  /* eslint-enable react-hooks/set-state-in-effect */
  function applyRestore() {
    if (!restore) return;
    if (body.current) body.current.value = restore.body ?? '';
    const t = document.getElementById('f-title') as HTMLInputElement | null; if (t && restore.title) { t.value = restore.title; setTitle(restore.title); }
    setRestore(null);
  }

  function wrap(before: string, after = before, placeholder = 'text') {
    const el = body.current; if (!el) return;
    const [s, e] = [el.selectionStart, el.selectionEnd];
    const sel = el.value.slice(s, e) || placeholder;
    el.setRangeText(`${before}${sel}${after}`, s, e, 'end');
    el.focus();
  }
  function line(prefix: string) {
    const el = body.current; if (!el) return;
    const s = el.value.lastIndexOf('\n', el.selectionStart - 1) + 1;
    el.setRangeText(prefix, s, s, 'end'); el.focus();
  }
  function link() {
    const url = window.prompt('Link address (https://…)', 'https://'); if (!url) return;
    wrap('[', `](${url})`, 'link text');
  }
  async function addPicture() {
    const f = document.createElement('input'); f.type = 'file'; f.accept = 'image/jpeg,image/png';
    f.onchange = async () => {
      const file = f.files?.[0]; if (!file) return;
      const alt = window.prompt('Describe the picture in a few words (for people who cannot see it)', ''); if (!alt) return;
      setPic({ busy: true, err: '' });
      try {
        const fd = new FormData(); fd.append('file', file); fd.append('alt', alt);
        const j = await (await fetch('/admin/journal/upload', { method: 'POST', body: fd })).json() as { ok: boolean; url?: string; error?: string };
        if (!j.ok || !j.url) throw new Error(j.error || 'Upload failed.');
        const el = body.current!; el.setRangeText(`\n\n![${alt.replace(/[\[\]]/g, '')}](${j.url})\n\n`, el.selectionStart, el.selectionEnd, 'end'); el.focus();
        setPic({ busy: false, err: '' });
      } catch (e) { setPic({ busy: false, err: e instanceof Error ? e.message : 'Upload failed.' }); }
    };
    f.click();
  }

  const url = `${siteUrl}/journal/${slug || 'your-article'}`;
  const host = siteUrl.replace(/^https?:\/\//, '');

  return (
    <ActionForm action={action} className="max-w-3xl pb-32" id="article-form">
      <div ref={form} />
      {article.id && <input type="hidden" name="id" value={article.id} />}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-5">
        <span className={`badge ${live ? 'badge-good' : article.status === 'SCHEDULED' ? 'badge-info' : article.status === 'ARCHIVED' ? 'badge-bad' : 'badge-neutral'}`}>{STATUS_LABEL[article.status] ?? article.status}</span>
        {article.status === 'SCHEDULED' && article.scheduledFor && <span className="text-sm text-steel">goes live {new Date(article.scheduledFor).toLocaleString('en-GB', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' })}</span>}
      </div>
      {restore && (
        <div className="alert alert-warn mb-5" role="status">
          <p>An unsaved version of this article was found on this device.</p>
          <div className="mt-2 flex gap-2"><button type="button" className="btn btn-dark btn-sm" onClick={applyRestore}>Restore it</button><button type="button" className="btn btn-outline btn-sm" onClick={() => { try { localStorage.removeItem(key); } catch { /* ignore */ } setRestore(null); }}>Discard it</button></div>
        </div>
      )}

      <section className="space-y-5" aria-labelledby="w-h">
        <h2 id="w-h" className="!text-xl">Write</h2>
        <div>
          <label htmlFor="f-title" className="label">Title<span className="req" aria-hidden="true">*</span></label>
          <input id="f-title" name="title" className="input !text-lg !min-h-[3.25rem]" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required />
        </div>
        <Field name="subtitle" label="Subtitle (optional)" defaultValue={article.subtitle} maxLength={200} />
        <div>
          <label htmlFor="f-excerpt" className="label">Summary<span className="req" aria-hidden="true">*</span></label>
          <textarea id="f-excerpt" name="excerpt" className="textarea" rows={3} maxLength={300} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} aria-describedby="excerpt-hint" />
          <p id="excerpt-hint" className="hint">Shown in listings, search results and as the default social caption. <span className="mono">{excerpt.length}/300</span></p>
        </div>
        <div>
          <p className="label" id="body-l">Article</p>
          <div className="flex flex-wrap gap-1.5 mb-2" role="toolbar" aria-label="Formatting" aria-labelledby="body-l">
            <Tool label="Bold" text="B" onClick={() => wrap('**')} />
            <Tool label="Italic" text="I" onClick={() => wrap('*')} />
            <Tool label="Heading" text="H" onClick={() => line('## ')} />
            <Tool label="Quote" text="❝" onClick={() => line('> ')} />
            <Tool label="Bulleted list" icon="list" onClick={() => line('- ')} />
            <Tool label="Link" text="🔗" onClick={link} />
            <button type="button" onClick={addPicture} disabled={pic.busy} className="btn btn-outline !min-h-[2.75rem] !px-3"><Icon name="image" size={18} />{pic.busy ? 'Uploading…' : 'Picture'}</button>
          </div>
          <textarea ref={body} id="f-body" name="body" aria-labelledby="body-l" className="textarea !min-h-[22rem] !text-[1.05rem] leading-relaxed" defaultValue={article.body} />
          {pic.err && <p className="field-error" role="alert">{pic.err}</p>}
          <p className="hint">Plain text with simple formatting: **bold**, *italic*, “## ” for a heading, “{'> '}” for a quote. Anything in [[double square brackets]] marks unfinished text and stops publishing.</p>
        </div>
      </section>

      <details className="mt-8 border-t border-line pt-5" open>
        <summary className="cursor-pointer font-display font-semibold text-lg min-h-[2.75rem] flex items-center">Photo and video</summary>
        <div className="mt-4 space-y-5">
          <PhotoPicker name="featuredImageKey" label="Featured picture" options={photos} defaultValue={article.featuredImageKey} hint="Used at the top of the article, in listings and when the article is shared." />
          <Field name="featuredImageAlt" label="Picture description (optional)" defaultValue={article.featuredImageAlt} hint="For people who cannot see the picture. Leave empty to use the photo’s own description." />
          <Field name="videoUrl" label="Video link (optional)" type="text" defaultValue={article.videoUrl} placeholder="https://www.youtube.com/watch?v=…" hint="A YouTube or Vimeo link. Upload the video there first, then paste its address." />
        </div>
      </details>

      <details className="mt-6 border-t border-line pt-5" open>
        <summary className="cursor-pointer font-display font-semibold text-lg min-h-[2.75rem] flex items-center">Category and tags</summary>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <Field name="categoryId" label="Category" type="select" required defaultValue={article.categoryId} options={categories} />
          <Field name="tags" label="Tags" defaultValue={article.tags} hint="Separate with commas. Up to ten." />
        </div>
      </details>

      <details className="mt-6 border-t border-line pt-5">
        <summary className="cursor-pointer font-display font-semibold text-lg min-h-[2.75rem] flex items-center">Search and sharing</summary>
        <div className="mt-4 space-y-5">
          <div>
            <label htmlFor="f-seot" className="label">Search title (optional)</label>
            <input id="f-seot" name="seoTitle" className="input" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} maxLength={70} />
            <p className="hint"><span className="mono">{seoTitle.length}/70</span> Leave empty to use the article title.</p>
          </div>
          <div>
            <label htmlFor="f-seod" className="label">Search description (optional)</label>
            <textarea id="f-seod" name="seoDescription" className="textarea" rows={3} maxLength={200} value={seoDesc} onChange={(e) => setSeoDesc(e.target.value)} />
            <p className="hint"><span className="mono">{seoDesc.length}/200</span> Leave empty to use the summary.</p>
          </div>
          <div>
            <label htmlFor="f-slug" className="label">Web address</label>
            <input id="f-slug" name="slug" className="input mono" value={slug} onChange={(e) => setSlug(e.target.value)} readOnly={article.status === 'PUBLISHED' || article.status === 'ARCHIVED'} placeholder="made from the title" />
            <p className="hint">{article.status === 'PUBLISHED' ? 'Fixed once published, so shared links keep working.' : 'Made from the title when empty.'}</p>
          </div>
          <div className="border border-line bg-white p-4" aria-label="How it looks in search results">
            <p className="mono text-xs text-steel truncate">{host} › journal › {slug || '…'}</p>
            <p className="text-[1.15rem] text-[#1a0dab] leading-snug mt-1">{seoTitle || title || 'Your title'}</p>
            <p className="text-sm text-steel mt-1">{seoDesc || excerpt || 'Your summary appears here.'}</p>
          </div>
        </div>
      </details>

      {canSocial && (
        <details className="mt-6 border-t border-line pt-5" open={accounts.length > 0}>
          <summary className="cursor-pointer font-display font-semibold text-lg min-h-[2.75rem] flex items-center">Share to social media</summary>
          <div className="mt-4 space-y-4">
            {accounts.length === 0 && <p className="text-steel">No social accounts are connected yet. Ask someone with access to connect them under Social accounts.</p>}
            <p className="text-sm text-steel">Tick the channels this article should go to. Each gets its own wording. Posts go out when the article is published{live ? ' (already live: use “Send to ticked channels”)' : ''}. Where a platform cannot take a post automatically, it is put on a list for you to post by hand, and the team is told.</p>
            {accounts.map((a) => <ShareRow key={a.id} a={a} url={url} excerpt={excerpt} title={title} live={live} />)}
          </div>
        </details>
      )}

      <details className="mt-6 border-t border-line pt-5">
        <summary className="cursor-pointer font-display font-semibold text-lg min-h-[2.75rem] flex items-center">Schedule</summary>
        <div className="mt-4"><Field name="scheduledFor" label="Publish at (Lagos time)" type="datetime-local" defaultValue={article.scheduledFor} hint="Used by “Schedule”. The site publishes it by itself at that time." /></div>
      </details>

      <div className="fixed inset-x-0 bottom-0 z-30 bg-white border-t border-line shadow-[0_-6px_18px_rgba(0,0,0,.08)] no-print" role="group" aria-label="Actions">
        <div className="max-w-[88rem] mx-auto px-4 md:px-8 py-3 flex flex-wrap gap-2 lg:pl-[17rem] items-center">
          <SubmitButton name="intent" value="save" className="btn btn-dark" pending="Saving…">{live ? 'Save changes' : 'Save draft'}</SubmitButton>
          {article.id && <a href={`/admin/journal/${article.id}/preview`} className="btn btn-outline" target="_blank" rel="noopener">Preview<span className="sr-only"> (new tab)</span></a>}
          {canPublish && !live && <SubmitButton name="intent" value="publish" className="btn btn-primary" pending="Publishing…">Publish now</SubmitButton>}
          {canPublish && !live && <SubmitButton name="intent" value="schedule" className="btn btn-outline" pending="Scheduling…">Schedule</SubmitButton>}
          {canSocial && live && <SubmitButton name="intent" value="share" className="btn btn-primary" pending="Sending…">Send to ticked channels</SubmitButton>}
          {canPublish && live && <SubmitButton name="intent" value="unpublish" className="btn btn-outline" pending="Working…">Unpublish</SubmitButton>}
          {canPublish && article.id && article.status !== 'ARCHIVED' && <SubmitButton name="intent" value="archive" className="btn btn-danger" pending="Working…">Remove from site</SubmitButton>}
          {canPublish && article.status === 'ARCHIVED' && <SubmitButton name="intent" value="restore" className="btn btn-outline" pending="Working…">Restore as draft</SubmitButton>}
        </div>
      </div>
    </ActionForm>
  );
}

function ShareRow({ a, url, excerpt, title, live }: { a: EditorAccount; url: string; excerpt: string; title: string; live: boolean }) {
  const p = a.post;
  const spec = SPECS[a.platform];
  const [on, setOn] = useState(!!p && p.status !== 'CANCELLED');
  const [caption, setCaption] = useState(p?.caption ?? '');
  const [tags, setTags] = useState((p?.hashtags ?? []).join(' '));
  const [link, setLink] = useState(p?.includeLink ?? spec.clickableLink);
  const out = p && ['PUBLISHED', 'QUEUED'].includes(p.status);
  const effective = caption || excerpt || title;
  const c = composePost(a.platform, { caption: effective, hashtags: normaliseHashtags(tags, spec.maxHashtags), url, includeLink: link });
  const broken = a.status !== 'CONNECTED' && a.mode === 'AUTO';
  return (
    <fieldset className="border border-line bg-white p-4" disabled={!!out}>
      <legend className="px-1 font-semibold">{a.displayName} <span className="text-steel font-normal">· {spec.label}</span></legend>
      <label className="check"><input type="checkbox" name={`share_${a.id}`} checked={on} onChange={(e) => setOn(e.target.checked)} /><span>Post to {a.displayName}</span></label>
      {a.mode === 'MANUAL' && <p className="hint">You post this one by hand; it is put on your list when the article goes live.</p>}
      {broken && <p className="hint !text-ember">This account needs attention: {a.lastError ?? 'reconnect it'}. The post will be put on the list to post by hand.</p>}
      {p && <p className={`mt-2 text-sm ${p.status === 'FAILED' ? 'text-ember font-semibold' : 'text-steel'}`}>Status: {POST_LABEL[p.status] ?? p.status}{p.externalUrl ? <> · <a href={p.externalUrl} rel="noopener noreferrer">view post</a></> : null}{p.error ? ` · ${p.error}` : ''}{p.note ? ` · ${p.note}` : ''}</p>}
      {on && !out && (
        <div className="mt-3 space-y-3">
          <div>
            <label htmlFor={`cap-${a.id}`} className="label">Caption for {spec.label}</label>
            <textarea id={`cap-${a.id}`} name={`caption_${a.id}`} className="textarea" rows={3} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder={excerpt || title} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label htmlFor={`tag-${a.id}`} className="label">Hashtags</label><input id={`tag-${a.id}`} name={`tags_${a.id}`} className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="leadership enterprise" /><p className="hint">Up to {spec.maxHashtags} on {spec.label}.</p></div>
            <div className="self-end"><label className="check"><input type="checkbox" name={`link_${a.id}`} checked={link} onChange={(e) => setLink(e.target.checked)} /><span>{spec.clickableLink ? 'Include the article link' : 'Say “link in bio”'}</span></label></div>
          </div>
          <div className="bg-paper-2 p-3 text-sm whitespace-pre-wrap break-words" aria-live="polite"><p className="mono text-xs text-steel mb-1">Exactly what {spec.label} will receive · <span className={c.tooLong ? 'text-ember font-bold' : ''}>{c.length}/{spec.maxChars}</span></p>{c.text}</div>
          {c.tooLong && <p className="field-error">Too long for {spec.label}. Shorten the caption; otherwise this one is put on the list to post by hand.</p>}
          {c.notes.map((n) => <p key={n} className="hint">{n}</p>)}
        </div>
      )}
    </fieldset>
  );
}
