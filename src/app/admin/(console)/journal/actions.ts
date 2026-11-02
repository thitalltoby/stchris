'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { runAction, str, type FormState } from '@/server/action-utils';
import { actionStaff } from '@/server/rbac';
import { can } from '@/lib/permissions';
import { saveArticle, deleteArticle, type ArticleAction } from '@/server/journal';
import { listAccounts, prepareShares, connectAccount, verifyAccount, updateAccount, disconnectAccount, retryPost, markPostedByHand, cancelPost, type ShareSelection } from '@/server/social';
import { fromLagosLocalInput } from '@/lib/format';

const INTENTS = ['save', 'publish', 'schedule', 'unpublish', 'archive', 'restore', 'share'] as const;
type Intent = (typeof INTENTS)[number];

export async function saveArticleAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff();
    const intent = (INTENTS as readonly string[]).includes(str(fd, 'intent')) ? (str(fd, 'intent') as Intent) : 'save';
    const id = str(fd, 'id') || null;
    const raw = {
      title: str(fd, 'title'), subtitle: str(fd, 'subtitle'), excerpt: str(fd, 'excerpt'), body: String(fd.get('body') ?? ''), categoryId: str(fd, 'categoryId'), tags: str(fd, 'tags'),
      featuredImageKey: str(fd, 'featuredImageKey'), featuredImageAlt: str(fd, 'featuredImageAlt'), videoUrl: str(fd, 'videoUrl'), seoTitle: str(fd, 'seoTitle'), seoDescription: str(fd, 'seoDescription'),
      slug: str(fd, 'slug'), scheduledFor: fromLagosLocalInput(str(fd, 'scheduledFor')),
    };
    const canSocial = can(user.role, 'social.publish');
    // 1. save the words (stays a draft until step 3)
    const saved = await saveArticle(user, id, raw, 'save');
    // 2. remember which channels were ticked, with their own wording
    let sharesNote = '';
    if (canSocial && (saved.status !== 'PUBLISHED' || intent === 'share')) {
      const accounts = await listAccounts();
      const picks: ShareSelection[] = accounts.filter((a) => fd.get(`share_${a.id}`) === 'on').map((a) => ({ accountId: a.id, caption: str(fd, `caption_${a.id}`) || saved.excerpt || saved.title, hashtags: str(fd, `tags_${a.id}`), includeLink: fd.get(`link_${a.id}`) === 'on' }));
      if (picks.length || saved.status !== 'PUBLISHED') await prepareShares(user, saved.id, picks);
      if (intent === 'share') sharesNote = picks.length ? ' Sent to the ticked channels: check the progress under Social queue.' : ' No channels were ticked.';
    }
    // 3. change status
    if (intent === 'publish' || intent === 'schedule' || intent === 'unpublish' || intent === 'archive' || intent === 'restore') await saveArticle(user, saved.id, raw, intent as ArticleAction);
    revalidatePath('/journal'); revalidatePath(`/journal/${saved.slug}`); revalidatePath('/admin/journal');
    if (!id) redirect(`/admin/journal/${saved.id}?done=${intent}`);
    const msg: Record<Intent, string> = { save: 'Saved.', share: `Saved.${sharesNote}`, publish: 'Published. It is on the site now; social posts are on their way.', schedule: 'Scheduled. It will go live by itself at that time.', unpublish: 'Taken off the site and returned to draft.', archive: 'Removed from the site. You can restore it later.', restore: 'Restored as a draft.' };
    if (intent === 'unpublish' || intent === 'archive' || intent === 'restore' || intent === 'publish' || intent === 'schedule') redirect(`/admin/journal/${saved.id}?done=${intent}`);
    return msg[intent];
  });
}

export async function deleteArticleAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff();
    await deleteArticle(user, str(fd, 'id'));
    revalidatePath('/admin/journal');
    redirect('/admin/journal?done=deleted');
  });
}

// ─── Social accounts and queue ─────────────────────────────────────

export async function connectAccountAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff('social.manage');
    await connectAccount(user, { platform: str(fd, 'platform'), displayName: str(fd, 'displayName'), externalId: str(fd, 'externalId'), token: str(fd, 'token'), mode: str(fd, 'mode') || 'AUTO', tokenExpiresOn: str(fd, 'tokenExpiresOn') });
    revalidatePath('/admin/journal/social');
    return 'Account connected.';
  });
}

export async function accountAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff('social.manage');
    const id = str(fd, 'id');
    const op = str(fd, 'op');
    let message = 'Done.';
    if (op === 'verify') message = (await verifyAccount(user, id)).message;
    else if (op === 'manual') await updateAccount(user, id, { mode: 'MANUAL' });
    else if (op === 'auto') await updateAccount(user, id, { mode: 'AUTO' });
    else if (op === 'disable') await updateAccount(user, id, { disabled: true });
    else if (op === 'enable') await updateAccount(user, id, { disabled: false });
    else if (op === 'token') await updateAccount(user, id, { token: str(fd, 'token') });
    else if (op === 'disconnect') await disconnectAccount(user, id);
    revalidatePath('/admin/journal/social');
    return message;
  });
}

export async function postAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff('social.publish');
    const id = str(fd, 'id');
    const op = str(fd, 'op');
    if (op === 'retry') await retryPost(user, id);
    else if (op === 'posted') await markPostedByHand(user, id, str(fd, 'url'));
    else if (op === 'cancel') await cancelPost(user, id);
    revalidatePath('/admin/journal/social');
    return op === 'retry' ? 'Queued again.' : op === 'posted' ? 'Marked as posted.' : 'Cancelled.';
  });
}
