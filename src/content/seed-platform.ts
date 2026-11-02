import type { SeedService } from './seed-content';

/** Which department receives each request type, and where it sits on the opportunities page ("buy", "partner" or "connect"). */
export const SERVICE_ROUTING: Record<string, { department: string; audience: 'buy' | 'partner' | 'connect' }> = {
  'materials-quotation': { department: 'sales', audience: 'buy' },
  'project-bulk-supply': { department: 'sales', audience: 'buy' },
  'source-a-product': { department: 'procurement', audience: 'buy' },
  'trade-account': { department: 'sales', audience: 'buy' },
  'dealer-partnership': { department: 'partnerships', audience: 'partner' },
  'supplier-introduction': { department: 'procurement', audience: 'partner' },
  'ask-a-question': { department: 'sales', audience: 'connect' },
  'corporate-procurement': { department: 'procurement', audience: 'buy' },
  'partnership-proposal': { department: 'partnerships', audience: 'partner' },
  'investment-enquiry': { department: 'executive', audience: 'partner' },
  'career-interest': { department: 'people', audience: 'connect' },
  'media-speaking': { department: 'communications', audience: 'connect' },
};

type F = SeedService['fields'][number];
const notes: F = { key: 'notes', label: 'Anything else we should know?', type: 'TEXTAREA', section: 'Additional information' };

/** Request types added for the opportunities and engagement sections. They carry no claims about St. Chris: they only ask the visitor questions. */
export const PLATFORM_SERVICES: SeedService[] = [
  {
    slug: 'corporate-procurement', name: 'Corporate procurement enquiry', pillar: 'Procurement', icon: 'briefcase', imageKey: 'office-shelving', sortOrder: 8, acceptsItems: true,
    summary: 'For companies, institutions and developers buying on a framework, a tender or a recurring schedule.',
    description: 'Tell us what your organisation buys, how often and how you evaluate suppliers. You can attach a bill of quantities, a specification or a tender document. The procurement team replies, and a written quotation follows where there is a fit.',
    highlights: ['Tender and framework supply', 'Recurring and scheduled orders', 'Specifications and bills of quantities accepted'],
    instructions: 'Add catalogue lines if you have them, or attach your specification.',
    fields: [
      { key: 'organisation_type', label: 'Type of organisation', type: 'SELECT', required: true, section: 'Your organisation', options: ['Corporate', 'Government or institution', 'Developer', 'Contractor', 'Hospitality', 'Other'] },
      { key: 'procurement_mode', label: 'How do you buy?', type: 'SELECT', required: true, section: 'Your requirement', options: ['One-off purchase', 'Recurring supply', 'Tender', 'Framework agreement', 'Not sure'] },
      { key: 'site_location', label: 'Delivery location', type: 'TEXT', section: 'Your requirement' },
      { key: 'requirement', label: 'What do you need?', type: 'TEXTAREA', required: true, section: 'Your requirement' },
      { key: 'start_date', label: 'Needed from', type: 'DATE', section: 'Timing' }, { key: 'end_date', label: 'Needed by', type: 'DATE', section: 'Timing' },
      notes,
    ],
  },
  {
    slug: 'partnership-proposal', name: 'Business partnership proposal', pillar: 'Partnerships', icon: 'users', imageKey: 'leadership-meeting', sortOrder: 9, acceptsItems: false,
    summary: 'Propose a business partnership or collaboration with St. Chris Global.',
    description: 'St. Chris looks for partners who share its commercial objectives and its long-term view. Describe your business, what you propose and what you would each bring. The partnerships team reads every proposal.',
    highlights: ['Strategic and commercial partnerships', 'Enterprise development collaborations', 'Every proposal is read by the partnerships team'],
    instructions: 'Keep it specific: who you are, what you propose, and what you hope for. Attach a profile or proposal if you have one.',
    fields: [
      { key: 'organisation', label: 'Your organisation', type: 'TEXT', required: true, section: 'About you' },
      { key: 'website', label: 'Website', type: 'TEXT', section: 'About you' },
      { key: 'proposal_type', label: 'What kind of partnership?', type: 'SELECT', required: true, section: 'Your proposal', options: ['Distribution or retail', 'Supply or manufacturing', 'Joint venture', 'Enterprise development', 'Training or mentoring', 'Other'] },
      { key: 'proposal', label: 'Your proposal', type: 'TEXTAREA', required: true, section: 'Your proposal', helpText: 'What you propose, what each side brings, and the outcome you want.' },
      { key: 'timeline', label: 'When would you like to start?', type: 'TEXT', section: 'Your proposal' },
      notes,
    ],
  },
  {
    slug: 'investment-enquiry', name: 'Investment or strategic collaboration', pillar: 'Partnerships', icon: 'briefcase', imageKey: null, sortOrder: 10, acceptsItems: false,
    summary: 'Open a conversation about investment or a strategic collaboration.',
    description: 'For investors and organisations interested in a strategic collaboration with St. Chris Global. Your message goes to the executive office. It is an introduction only: it does not commit either side.',
    highlights: ['Goes to the executive office', 'An introduction, not a commitment'],
    instructions: 'Say who you are and what you have in mind.',
    fields: [
      { key: 'organisation', label: 'Your organisation', type: 'TEXT', required: true, section: 'About you' },
      { key: 'interest', label: 'What are you interested in?', type: 'SELECT', required: true, section: 'Your message', options: ['Investment', 'Strategic collaboration', 'Joint venture', 'Other'] },
      { key: 'message', label: 'Your message', type: 'TEXTAREA', required: true, section: 'Your message' },
    ],
  },
  {
    slug: 'career-interest', name: 'Career and professional opportunities', pillar: 'People', icon: 'users', imageKey: null, sortOrder: 11, acceptsItems: false,
    summary: 'Tell us you are interested in working with or alongside St. Chris Global.',
    description: 'Send your interest and your CV. If there is an open role it is listed under Opportunities; if not, we keep your details in case something fits. Sending this is not an application for a specific job unless you name one.',
    highlights: ['CV accepted as an attachment', 'Reviewed by the people team'],
    instructions: 'Attach your CV (PDF or Word).',
    fields: [
      { key: 'role_interest', label: 'The role or area you are interested in', type: 'TEXT', required: true, section: 'Your interest' },
      { key: 'experience', label: 'A short summary of your experience', type: 'TEXTAREA', required: true, section: 'Your interest' },
      { key: 'location', label: 'Where are you based?', type: 'TEXT', section: 'Your interest' },
      { key: 'linkedin', label: 'LinkedIn profile', type: 'TEXT', section: 'Your interest' },
    ],
  },
  {
    slug: 'media-speaking', name: 'Media, speaking and event request', pillar: 'Media', icon: 'mail', imageKey: null, sortOrder: 12, acceptsItems: false,
    summary: 'Interview, speaking engagement or event invitation for Chris Iyoha or St. Chris Global.',
    description: 'Journalists, conference organisers and event hosts can send a request here. It goes to the communications team, who will reply about availability.',
    highlights: ['Goes to the communications team'],
    instructions: 'Give the date, place and audience if it is an event.',
    fields: [
      { key: 'request_type', label: 'What is this about?', type: 'SELECT', required: true, section: 'Your request', options: ['Interview', 'Speaking engagement', 'Conference or panel', 'Event invitation', 'Other'] },
      { key: 'outlet', label: 'Publication, organiser or event', type: 'TEXT', required: true, section: 'Your request' },
      { key: 'event_date', label: 'Date (if there is one)', type: 'DATE', section: 'Your request' },
      { key: 'message', label: 'Details', type: 'TEXTAREA', required: true, section: 'Your request' },
    ],
  },
];

export interface SeedDivision { slug: string; name: string; tagline: string; summary: string; description: string; highlights: string[]; offerings: string[]; categorySlugs: string[]; serviceSlug: string | null; imageKey: string; icon: string; sortOrder: number }

/** The six business areas named in the brief. Text restates what the corporate profile already says; flagged for review in the console. */
export const DIVISIONS: SeedDivision[] = [
  { slug: 'building-materials', name: 'Building Materials & Construction Supplies', tagline: 'What gets a project built.', summary: 'General building materials, construction accessories, plumbing and water storage for residential, commercial and industrial work.', description: 'Supplies for construction, renovation and property development, for contractors, retailers, developers and individual customers.\n\nIf a line is not in the catalogue, tell us. Sourcing and importation are part of what St. Chris does.', highlights: ['Residential, commercial and industrial', 'Contractors, developers and retailers', 'Anything not listed can be sourced'], offerings: ['General building materials', 'Construction accessories', 'Plumbing pipes, fittings and valves', 'Water storage tanks', 'Water heaters'], categorySlugs: ['building-materials', 'plumbing-pipes-and-fittings', 'water-storage-tanks', 'water-heaters'], serviceSlug: 'project-bulk-supply', imageKey: 'site-rebar', icon: 'container', sortOrder: 1 },
  { slug: 'bathroom-and-kitchen', name: 'Bathroom & Kitchen Solutions', tagline: 'Rooms people live in.', summary: 'Sanitary ware, baths, showers, taps, mixers and kitchen solutions.', description: 'Bathroom and kitchen products for homes, hotels and commercial fit-outs: sanitary ware, baths and shower systems, taps and mixers, kitchen sinks and equipment.', highlights: ['Homes, hospitality and fit-outs', 'Trade and project pricing by quotation', 'Retail and home projects quoted in writing'], offerings: ['Toilets, basins and vanities', 'Baths and shower systems', 'Taps and mixers', 'Kitchen sinks and equipment'], categorySlugs: ['sanitary-ware', 'baths-and-showers', 'taps-and-mixers', 'kitchen-solutions'], serviceSlug: 'materials-quotation', imageKey: 'bathroom-stone', icon: 'waves', sortOrder: 2 },
  { slug: 'interior-finishing', name: 'Interior Finishing', tagline: 'The last 10% people see first.', summary: 'Ceramic and porcelain tiles, architectural accessories and finishing products.', description: 'Tiles and finishing products for interiors, for designers, architects, contractors and homeowners.', highlights: ['Designers, architects and contractors', 'Tiles and architectural accessories'], offerings: ['Ceramic and porcelain tiles', 'Architectural accessories', 'Finishing products'], categorySlugs: ['tiles', 'interior-finishing'], serviceSlug: 'materials-quotation', imageKey: 'tiles-lobby', icon: 'layers', sortOrder: 3 },
  { slug: 'procurement-and-sourcing', name: 'Procurement & Sourcing', tagline: 'We find it, check it, and bring it in.', summary: 'Identifying, engaging and coordinating suppliers for products you cannot easily find.', description: 'Supplier identification and engagement, and procurement coordination for customers and organisations that need specific products or a managed supply.\n\nCorporate buyers can send a specification, a bill of quantities or a tender.', highlights: ['Supplier identification and engagement', 'Corporate and tender procurement', 'Specifications and BOQs accepted'], offerings: ['Source a specific product', 'Corporate procurement', 'Supplier introductions'], categorySlugs: [], serviceSlug: 'corporate-procurement', imageKey: 'office-laptops', icon: 'search', sortOrder: 4 },
  { slug: 'importation-and-distribution', name: 'Importation & Distribution', tagline: 'From the manufacturer to the market.', summary: "Major distributor and strategic partner of GeePee Water Tanks, with importation and structured distribution across wholesale, retail and project channels.", description: "St. Chris Global is a major distributor and strategic partner of GeePee Water Tanks, Africa's No. 1 Water Tank Manufacturer, and connects other manufacturers and suppliers with the Nigerian market through importation, procurement coordination and structured distribution, to dealers, resellers, contractors and retail.\n\nDealers, developers and contractors can ask about GeePee tanks for resale, bulk and project supply.", highlights: ['Major distributor of GeePee Water Tanks', 'Wholesale, retail and project channels', 'Dealer and reseller arrangements'], offerings: ['Wholesale and bulk supply', 'Dealer and reseller partnerships', 'Manufacturer introductions'], categorySlugs: ['water-storage-tanks'], serviceSlug: 'dealer-partnership', imageKey: 'container-trailer', icon: 'truck', sortOrder: 5 },
  { slug: 'partnerships-and-enterprise-development', name: 'Strategic Partnerships & Enterprise Development', tagline: 'Growing businesses, together.', summary: 'Long-term commercial partnerships and enterprise development.', description: 'St. Chris works through long-term partnerships and invests in enterprise development. Chris Iyoha also trains executives and emerging leaders.\n\nIf you have a proposal, send it. The partnerships team reads every one.', highlights: ['Long-term commercial partnerships', 'Enterprise development', 'Proposals read by the partnerships team'], offerings: ['Business partnerships', 'Distribution opportunities', 'Investment and strategic collaboration'], categorySlugs: [], serviceSlug: 'partnership-proposal', imageKey: 'leadership-meeting', icon: 'users', sortOrder: 6 },
];

export const GEEPEE_SLUG = 'geepee-tanks-partnership';
export const GEEPEE_TITLE = 'Built on Trust, Sustained by Partnership: The Chris Iyoha and GeePee Tanks Business Story';

/**
 * The GeePee Tanks feature is a DRAFT skeleton. The brief gives the structure it must cover but none of the facts (how the relationship
 * began, dates, milestones, quotations), so none are invented. Every [[...]] marker blocks publishing until it is replaced.
 */
export const GEEPEE_BODY = `## How it began

[[How Chris Iyoha and GeePee Tanks first met, and what each side saw in the other. Needs the real account.]]

## How the relationship grew

[[How the partnership developed over the years: distribution, market development and the opportunities it opened.]]

## Why long-term partnerships

[[Chris Iyoha's own words on building partnerships that last, ideally from an interview.]]

## Trust, consistency and shared objectives

[[Specific examples of trust and consistency in practice, and the shared commercial objectives behind the partnership.]]

## What it means for customers and the market

[[What customers and the wider market gain: availability, reliability, support. Needs facts, not claims.]]

## Milestones

[[Key milestones and achievements. Add them as dated entries in the console under Profile → GeePee milestones; they appear on this page automatically.]]

## Looking ahead

[[The future of the partnership and the opportunities both sides see.]]
`;
