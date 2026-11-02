import type { RequestStatus } from '@/generated/prisma/enums';

export interface CompanySettings {
  legalName: string;
  tradingName: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  whatsapp: string;
  officeHours: string;
  /** Optional, exactly as St. Chris wants it shown (for example “RC 123456”). Empty = not shown anywhere. */
  registrationNumber: string;
}

export interface QuoteSettings {
  currency: string;
  validityDays: number;
  /** Selectable tax rates. Nothing is applied unless a staff member chooses it on a line. */
  taxRates: { label: string; percent: number }[];
  defaultTaxPercent: number;
  paymentTerms: string;
  terms: string;
  introduction: string;
  requireApproval: boolean;
  /** Quotations at or above this total need approval. 0 = every quotation. Ignored when approval is off. */
  approvalThreshold: number;
  customerCanRespond: boolean;
}

export interface NotificationSettings {
  /** Internal recipients for new requests. Empty = all active Super Admins and Operations Admins. */
  newRequestTo: string[];
  approvalTo: string[];
  customerStatusEmails: RequestStatus[];
  followUpDays: Partial<Record<RequestStatus, number>>;
}

export interface SecuritySettings {
  /** Every staff account must have two-factor sign-in. Staff without it are sent to set it up before they can use the console. */
  requireStaffMfa: boolean;
}

/** A short, time-limited announcement shown above the public site header. Off by default: nothing is announced until staff write it. */
export interface NoticeSettings {
  enabled: boolean;
  text: string;
  /** Same-site path (starts with one "/") or an https address. Optional. */
  href: string;
  linkLabel: string;
  /** Last day the notice shows, YYYY-MM-DD in Lagos time. Empty = until switched off. */
  endsOn: string;
}

export interface Fact {
  id: string;
  label: string;
  value: string;
  source: string;
  verified: boolean;
  /** Reporting year or date the figure refers to, e.g. "2024" or "as at December 2025". Shown with the figure. */
  asOf?: string;
  /** Show on the home page. Undefined = the original three (see LEGACY_HOME_IDS). */
  home?: boolean;
  /** Position among the home-page figures (lower first). */
  order?: number;
}

/** A department that receives a kind of enquiry. `email` may hold several addresses separated by commas. Empty = the general new-request list. */
export interface Department { key: string; label: string; email: string; description: string }

export interface ExecutiveSection { id: string; title: string; body: string }
export interface ExecutiveSettings {
  name: string;
  /** The supplied professional headline */
  headline: string;
  strapline: string;
  portraitKey: string;
  sections: ExecutiveSection[];
  /** Short statements under "Philosophy". Empty until staff write them. */
  principles: { title: string; body: string }[];
  closing: string;
  /** Public profile addresses, shown only when filled in */
  linkedin: string;
  x: string;
  instagram: string;
  facebook: string;
}

/** Search Console ownership token (the content of Google's HTML-tag verification) and the default social sharing image. */
export interface SeoSettings { searchConsoleToken: string; defaultShareImage: string }

export const DEFAULTS = {
  company: {
    legalName: 'St. Chris Global Limited',
    tradingName: 'St. Chris Global',
    tagline: 'Building Better Spaces. Delivering Quality.',
    // No address, telephone number or email address was supplied with the corporate profile, so none is shown until staff enter them (Settings → Company).
    address: '',
    phone: '',
    email: '',
    whatsapp: '',
    officeHours: '',
    // The profile gives RC 493482 but asks for it to be reconfirmed with the CAC before external publication, so it stays empty until staff enter it.
    registrationNumber: '',
  } satisfies CompanySettings,
  quotes: {
    currency: 'NGN',
    validityDays: 14,
    taxRates: [{ label: 'No tax', percent: 0 }],
    defaultTaxPercent: 0,
    paymentTerms: '',
    terms: '',
    introduction: 'Thank you for your enquiry. Please find our quotation for the materials listed below.',
    requireApproval: true,
    approvalThreshold: 0,
    customerCanRespond: true,
  } satisfies QuoteSettings,
  notifications: {
    newRequestTo: [],
    approvalTo: [],
    customerStatusEmails: ['MORE_INFO_REQUIRED', 'QUOTATION_ISSUED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'DECLINED', 'CANCELLED'],
    followUpDays: { RECEIVED: 1, MORE_INFO_REQUIRED: 3, QUOTATION_ISSUED: 3 },
  } satisfies NotificationSettings,
  security: { requireStaffMfa: false } satisfies SecuritySettings,
  notice: { enabled: false, text: '', href: '', linkLabel: '', endsOn: '' } satisfies NoticeSettings,
  facts: [] as Fact[],
  departments: [
    { key: 'sales', label: 'Sales & Quotations', email: '', description: 'Product enquiries and requests for quotation.' },
    { key: 'procurement', label: 'Procurement & Sourcing', email: '', description: 'Corporate procurement, sourcing and supplier registration.' },
    { key: 'partnerships', label: 'Business Development & Partnerships', email: '', description: 'Partnership proposals, distribution and investment conversations.' },
    { key: 'executive', label: 'Executive Office', email: '', description: 'Strategic collaboration and requests for Chris Iyoha.' },
    { key: 'people', label: 'People & Careers', email: '', description: 'Career interest and professional opportunities.' },
    { key: 'communications', label: 'Communications & Media', email: '', description: 'Media, speaking and event requests.' },
  ] as Department[],
  executive: {
    name: 'Chris Iyoha',
    headline: 'Captain of Industry | Business Leader | Enterprise Development & Executive Mentorship',
    strapline: 'Visionary Leadership. Enterprise Growth. Lasting Impact.',
    portraitKey: 'chris-portrait',
    // Written from what the client brief says about Chris Iyoha, and nothing more. Dates, employers, titles and awards were not supplied, so none appear.
    sections: [
      { id: 'leadership', title: 'Leadership Beyond Business', body: 'Chris Iyoha builds enterprises, and he builds the people who run them. Alongside leading St. Chris Global, he trains seasoned professionals, executives and emerging leaders, and he speaks up for professional development as part of how organisations grow.' },
      { id: 'global', title: 'A Global Perspective', body: 'International training and exposure to global business practices shape how Chris approaches enterprise development: with standards that travel, and with a clear view of what Nigerian businesses need to compete.' },
      { id: 'vision', title: 'Vision & Impact', body: 'His vision is for St. Chris Global, and for the industries it works in, to be credible, progressive and globally minded. He gets there through partnerships, collaboration and the creation of opportunity for customers, partners and colleagues alike.' },
    ],
    principles: [],
    closing: 'Leading with purpose. Building with vision. Inspiring progress.',
    linkedin: '', x: '', instagram: '', facebook: '',
  } satisfies ExecutiveSettings,
  seo: { searchConsoleToken: '', defaultShareImage: 'chris-portrait' } satisfies SeoSettings,
};

