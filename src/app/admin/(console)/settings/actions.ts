'use server';

import { revalidatePath } from 'next/cache';
import { runAction, str, bool, type FormState } from '@/server/action-utils';
import { actionStaff } from '@/server/rbac';
import { setSetting, getSetting, type Fact } from '@/server/settings';
import { audit } from '@/server/audit';
import { invalid } from '@/server/errors';
import { emailSchema } from '@/lib/validation';
import { checkNotice } from '@/lib/notice';
import { MAX_HOME_FIGURES, LEGACY_HOME_IDS } from '@/lib/figures';
import { STATUS_LABELS } from '@/lib/workflow';
import type { RequestStatus } from '@/generated/prisma/enums';

const lines = (s: string) => s.split(/\r?\n|,/).map((x) => x.trim()).filter(Boolean);

export async function saveCompanyAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff('settings.manage');
    const email = str(fd, 'email').trim();
    if (email && !emailSchema.safeParse(email).success) throw invalid('Enter a valid email address.', { email: 'Invalid email.' });
    if (str(fd, 'legalName').trim().length < 2) throw invalid('Enter the company name.', { legalName: 'Required.' });
    await setSetting('company', { legalName: str(fd, 'legalName').trim(), tradingName: str(fd, 'tradingName').trim(), tagline: str(fd, 'tagline').trim(), address: str(fd, 'address').trim(), phone: str(fd, 'phone').trim(), email, whatsapp: str(fd, 'whatsapp').trim(), officeHours: str(fd, 'officeHours').trim(), registrationNumber: str(fd, 'registrationNumber').trim().slice(0, 60) }, user.id);
    await audit({ id: user.id, label: user.name }, 'settings.company', 'Setting', 'company');
    revalidatePath('/', 'layout');
    return 'Company details saved. They now appear across the public site, emails and PDFs.';
  });
}

export async function saveQuotesAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff('settings.manage');
    const rates = lines(str(fd, 'taxRates')).map((l) => { const [label, pc] = l.split(':').map((x) => x.trim()); const percent = Number(pc); if (!label || !Number.isFinite(percent) || percent < 0 || percent > 100) throw invalid(`Tax rate “${l}” must look like “Label: 7.5”.`, { taxRates: 'Use one “Label: percent” per line.' }); return { label, percent }; });
    if (!rates.length) throw invalid('Add at least one tax option (for example “No tax: 0”).', { taxRates: 'Required.' });
    const defaultTaxPercent = Number(str(fd, 'defaultTaxPercent') || 0);
    if (!rates.some((r) => r.percent === defaultTaxPercent)) throw invalid('The default tax percentage must be one of the listed rates.', { defaultTaxPercent: 'Not in the list.' });
    const validityDays = Number(str(fd, 'validityDays'));
    if (!Number.isInteger(validityDays) || validityDays < 1 || validityDays > 365) throw invalid('Validity must be between 1 and 365 days.', { validityDays: 'Invalid.' });
    const currency = str(fd, 'currency').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw invalid('Use a 3-letter currency code, e.g. NGN.', { currency: 'Invalid.' });
    const approvalThreshold = Number(str(fd, 'approvalThreshold') || 0);
    if (!Number.isFinite(approvalThreshold) || approvalThreshold < 0) throw invalid('The approval threshold must be zero or more.', { approvalThreshold: 'Invalid.' });
    await setSetting('quotes', { currency, validityDays, taxRates: rates, defaultTaxPercent, paymentTerms: str(fd, 'paymentTerms'), terms: str(fd, 'terms'), introduction: str(fd, 'introduction'), requireApproval: bool(fd, 'requireApproval'), approvalThreshold, customerCanRespond: bool(fd, 'customerCanRespond') }, user.id);
    await audit({ id: user.id, label: user.name }, 'settings.quotes', 'Setting', 'quotes');
    return 'Quotation settings saved. They apply to new quotations.';
  });
}

export async function saveNotificationsAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff('settings.manage');
    const newRequestTo = lines(str(fd, 'newRequestTo')); const approvalTo = lines(str(fd, 'approvalTo'));
    for (const e of [...newRequestTo, ...approvalTo]) if (!emailSchema.safeParse(e).success) throw invalid(`“${e}” is not a valid email address.`);
    const customerStatusEmails = (Object.keys(STATUS_LABELS) as RequestStatus[]).filter((s) => bool(fd, `status_${s}`));
    const followUpDays: Partial<Record<RequestStatus, number>> = {};
    for (const s of Object.keys(STATUS_LABELS) as RequestStatus[]) { const v = Number(str(fd, `follow_${s}`)); if (v > 0 && v <= 90) followUpDays[s] = Math.floor(v); }
    await setSetting('notifications', { newRequestTo, approvalTo, customerStatusEmails, followUpDays }, user.id);
    await audit({ id: user.id, label: user.name }, 'settings.notifications', 'Setting', 'notifications');
    return 'Notification settings saved.';
  });
}

export async function saveFactsAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff('settings.manage');
    const facts = await getSetting('facts');
    const next: Fact[] = [];
    for (const f of facts) {
      if (bool(fd, `remove_${f.id}`)) continue;
      const value = str(fd, `value_${f.id}`).trim() || f.value;
      const asOf = str(fd, `asof_${f.id}`).trim();
      if (value.length > 80) throw invalid(`“${f.label}”: keep the value under 80 characters.`);
      if (asOf.length > 40) throw invalid(`“${f.label}”: keep “as at” under 40 characters.`);
      const order = Number(str(fd, `order_${f.id}`) || 0);
      next.push({ ...f, value, asOf: asOf || undefined, verified: bool(fd, `verified_${f.id}`), home: bool(fd, `home_${f.id}`), order: Number.isFinite(order) ? order : 0 });
    }
    if (next.filter((f) => f.home).length > MAX_HOME_FIGURES) throw invalid(`Choose at most ${MAX_HOME_FIGURES} figures for the home page.`);
    await setSetting('facts', next, user.id);
    await audit({ id: user.id, label: user.name }, 'settings.facts', 'Setting', 'facts');
    revalidatePath('/', 'layout');
    return 'Saved.';
  });
}

export async function addFactAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff('settings.manage');
    const label = str(fd, 'label').trim(); const value = str(fd, 'value').trim(); const source = str(fd, 'source').trim(); const asOf = str(fd, 'asOf').trim();
    if (label.length < 3 || label.length > 120) throw invalid('Describe what the figure is (3 to 120 characters).', { label: 'Required.' });
    if (!value || value.length > 80) throw invalid('Enter the figure, e.g. “1,200” or “45,000 m²” (up to 80 characters).', { value: 'Required.' });
    if (source.length < 3) throw invalid('Say where the figure comes from, so it can be checked.', { source: 'Required.' });
    if (asOf.length > 40) throw invalid('Keep “as at” under 40 characters.', { asOf: 'Too long.' });
    const facts = await getSetting('facts');
    let id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'figure';
    while (facts.some((f) => f.id === id)) id = `${id}-2`;
    const home = bool(fd, 'home');
    if (home && facts.filter((f) => f.home ?? LEGACY_HOME_IDS.includes(f.id)).length >= MAX_HOME_FIGURES) throw invalid(`The home page already shows ${MAX_HOME_FIGURES} figures. Untick one first.`);
    await setSetting('facts', [...facts, { id, label, value, source, verified: bool(fd, 'verified'), asOf: asOf || undefined, home, order: 100 }], user.id);
    await audit({ id: user.id, label: user.name }, 'settings.fact_added', 'Setting', 'facts', { id });
    revalidatePath('/', 'layout');
    return 'Added to the register.';
  });
}

export async function saveSecurityAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff('settings.manage');
    const requireStaffMfa = bool(fd, 'requireStaffMfa');
    await setSetting('security', { requireStaffMfa }, user.id);
    await audit({ id: user.id, label: user.name }, 'settings.security', 'Setting', 'security', { requireStaffMfa });
    return requireStaffMfa ? 'Saved. Staff without two-factor sign-in are asked to set it up at their next page load.' : 'Saved. Two-factor sign-in is optional.';
  });
}

export async function saveNoticeAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await actionStaff('settings.manage');
    const r = checkNotice({ enabled: bool(fd, 'enabled'), text: str(fd, 'text'), href: str(fd, 'href'), linkLabel: str(fd, 'linkLabel'), endsOn: str(fd, 'endsOn') });
    if (!r.ok) throw invalid(r.error, { [r.field]: r.error });
    await setSetting('notice', r.value, user.id);
    await audit({ id: user.id, label: user.name }, 'settings.notice', 'Setting', 'notice', { enabled: r.value.enabled });
    revalidatePath('/', 'layout');
    return r.value.enabled ? 'Saved. The announcement is showing at the top of every public page.' : 'Saved. No announcement is showing.';
  });
}
