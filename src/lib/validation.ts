import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address.').max(200);
export const phoneSchema = z
  .string()
  .trim()
  .max(40)
  .regex(/^[0-9+()\-\s.]*$/, 'Use digits, spaces and + ( ) - only.')
  .optional()
  .or(z.literal(''));

export const customerInfoSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name.').max(120),
  email: emailSchema,
  phone: z.string().trim().min(6, 'Enter a phone number we can reach you on.').max(40).regex(/^[0-9+()\-\s.]+$/, 'Use digits, spaces and + ( ) - only.'),
  companyName: z.string().trim().max(160).optional().or(z.literal('')),
  jobTitle: z.string().trim().max(120).optional().or(z.literal('')),
});

export type CustomerInfo = z.infer<typeof customerInfoSchema>;

/** One line on a project list: a catalogue product (and optional size/variant) or a free-text line */
export const requestItemSchema = z.object({
  productId: z.string().max(40).nullish().transform((v) => v || null),
  variantId: z.string().max(40).nullish().transform((v) => v || null),
  label: z.string().trim().min(2, 'Name the item.').max(200),
  unit: z.string().trim().min(1).max(30).default('each'),
  quantity: z.coerce.number().positive('Quantity must be more than zero.').max(1e9, 'Quantity is too large.'),
  note: z.string().trim().max(500).optional().or(z.literal('')),
});
export type RequestItemInput = z.infer<typeof requestItemSchema>;

export const RECURRENCE = ['ONE_OFF', 'RECURRING'] as const;

export const requestSubmissionSchema = z.object({
  serviceId: z.string().min(1),
  details: z.record(z.string(), z.unknown()).default({}),
  recurrence: z.enum(RECURRENCE).default('ONE_OFF'),
  items: z.array(requestItemSchema).max(150, 'A single request can hold up to 150 lines.').default([]),
  customer: customerInfoSchema,
  idempotencyKey: z.string().min(8).max(80),
  /** Optional: status messages on these channels, only if the customer ticks the box */
  messaging: z.object({ sms: z.boolean().default(false), whatsapp: z.boolean().default(false) }).default({ sms: false, whatsapp: false }),
  /** Honeypot: real people never fill this in */
  website: z.string().max(0).optional().or(z.literal('')),
  consent: z.literal(true, { error: 'Please confirm you have read the privacy notice.' }),
});

export type RequestSubmission = z.infer<typeof requestSubmissionSchema>;

export interface FieldDef {
  key: string;
  label: string;
  type: 'TEXT' | 'TEXTAREA' | 'NUMBER' | 'SELECT' | 'DATE' | 'BOOLEAN';
  required: boolean;
  options?: string[] | null;
  unit?: string | null;
  helpText?: string | null;
  placeholder?: string | null;
  section?: string;
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

/** Validate answers against the service's configured fields. Returns cleaned values and per-field errors. */
export function validateDetails(fields: FieldDef[], raw: Record<string, unknown>): { values: Record<string, string | number | boolean>; errors: Record<string, string> } {
  const values: Record<string, string | number | boolean> = {};
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const v = raw[f.key];
    const empty = v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
    if (f.type === 'BOOLEAN') {
      values[f.key] = v === true || v === 'true' || v === 'on';
      if (f.required && !values[f.key]) errors[f.key] = `${f.label} is required.`;
      continue;
    }
    if (empty) {
      if (f.required) errors[f.key] = `${f.label} is required.`;
      continue;
    }
    switch (f.type) {
      case 'TEXT': {
        const s = String(v).trim();
        if (s.length > 500) errors[f.key] = `${f.label} must be 500 characters or fewer.`;
        else values[f.key] = s;
        break;
      }
      case 'TEXTAREA': {
        const s = String(v).trim();
        if (s.length > 4000) errors[f.key] = `${f.label} must be 4,000 characters or fewer.`;
        else values[f.key] = s;
        break;
      }
      case 'NUMBER': {
        const n = Number(String(v).replace(/,/g, ''));
        if (!Number.isFinite(n) || n < 0) errors[f.key] = `${f.label} must be a positive number.`;
        else if (n > 1e12) errors[f.key] = `${f.label} is too large.`;
        else values[f.key] = n;
        break;
      }
      case 'SELECT': {
        const s = String(v);
        if (!f.options?.includes(s)) errors[f.key] = `Choose one of the listed options for ${f.label}.`;
        else values[f.key] = s;
        break;
      }
      case 'DATE': {
        const s = String(v);
        if (!isoDate.test(s) || Number.isNaN(Date.parse(s))) errors[f.key] = `${f.label} must be a valid date.`;
        else values[f.key] = s;
        break;
      }
    }
  }
  return { values, errors };
}

export function displayValue(f: { type: string; unit?: string | null }, v: unknown): string {
  if (v === undefined || v === null || v === '') return '—';
  if (f.type === 'BOOLEAN') return v ? 'Yes' : 'No';
  if (f.type === 'NUMBER') return `${Number(v).toLocaleString('en-GB')}${f.unit ? ` ${f.unit}` : ''}`;
  return String(v);
}
