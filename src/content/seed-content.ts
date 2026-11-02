/**
 * Initial content for the Materials Desk, drawn only from the supplied St. Chris Global Limited Corporate Profile
 * and the supplied photographs. Everything is flagged `needsReview` until St. Chris confirms it in the console.
 *
 * Nothing is invented: no prices, no SKUs, no stock claims, no addresses or telephone numbers, no delivery or returns
 * terms. Categories follow the profile's sections 6.1 to 6.6; the "range" lines are the profile's own bullet points.
 * Only the three products that appear in the supplied photographs are seeded as products; staff add the rest.
 */

export interface SeedCategory {
  slug: string; name: string; groupLabel: string; summary: string; description: string; range: string[]; imageKey: string | null; sortOrder: number;
}

export const CATEGORIES: SeedCategory[] = [
  {
    slug: 'building-materials', name: 'Building materials and construction supplies', groupLabel: 'Building & plumbing', sortOrder: 1, imageKey: 'warehouse-pallets',
    summary: 'General building materials, construction accessories and related supplies for residential, commercial and industrial work.',
    description: 'Supplies that support residential, commercial and industrial construction, renovation and property development, for contractors, retailers, developers and individual customers.\n\nTell us what the job needs. If a line is not listed here, add it to your project list in your own words and we will source it.',
    range: ['General building materials', 'Construction accessories', 'Selected architectural and finishing materials', 'Other construction-related supplies'],
  },
  {
    slug: 'water-storage-tanks', name: 'Water storage tanks', groupLabel: 'Building & plumbing', sortOrder: 2, imageKey: 'tank-black-1',
    summary: 'Water storage tanks for homes, sites and developments.',
    description: 'Water storage tanks form part of our building materials range. Tell us the capacity you need and where it will be used, and we confirm the available sizes, price and delivery in a written quotation.',
    range: ['Water storage tanks'],
  },
  {
    slug: 'waste-management-products', name: 'Waste management products', groupLabel: 'Building & plumbing', sortOrder: 3, imageKey: null,
    summary: 'Waste management products for construction and property use.',
    description: 'Waste management products are part of our building materials interests. Describe what you need and we will come back with what we can supply.',
    range: ['Waste management products'],
  },
  {
    slug: 'plumbing-pipes-and-fittings', name: 'Plumbing pipes, fittings and valves', groupLabel: 'Building & plumbing', sortOrder: 4, imageKey: null,
    summary: 'Pipes, fittings, connectors, valves and installation components for water supply and plumbing work.',
    description: 'Products that support water supply and plumbing infrastructure, for plumbing professionals, contractors and developers.',
    range: ['Plumbing pipes and fittings', 'Water supply connectors', 'Valves and taps', 'Plumbing accessories', 'Related installation components'],
  },
  {
    slug: 'water-heaters', name: 'Water heaters', groupLabel: 'Building & plumbing', sortOrder: 5, imageKey: 'bathroom-shower-heater',
    summary: 'Electric water heaters for bathrooms and kitchens.',
    description: 'Electric water heaters for homes, hospitality and commercial properties. Tell us the setting and the number of units and we will quote.',
    range: ['Electric water heaters'],
  },
  {
    slug: 'sanitary-ware', name: 'Sanitary ware: toilets, basins and vanities', groupLabel: 'Bathroom & kitchen', sortOrder: 6, imageKey: 'bathroom-suite',
    summary: 'Water closets, wash basins and bathroom vanities that combine function, durability and contemporary design.',
    description: 'Bathroom products and sanitary ware for homeowners, interior designers, contractors, hospitality businesses and property developers.',
    range: ['Water closets and toilet systems', 'Wash basins and bathroom sinks', 'Bathroom vanities and cabinets'],
  },
  {
    slug: 'baths-and-showers', name: 'Baths, shower enclosures and shower systems', groupLabel: 'Bathroom & kitchen', sortOrder: 7, imageKey: 'bathroom-moodboard',
    summary: 'Bathtubs, shower enclosures, shower systems and finishing products.',
    description: 'Solutions for modern bathrooms, from a single renovation to a full development.',
    range: ['Bathtubs and shower enclosures', 'Shower systems and accessories', 'Shower mixers', 'Bathroom fittings and finishing products'],
  },
  {
    slug: 'taps-and-mixers', name: 'Bathroom taps and mixers', groupLabel: 'Bathroom & kitchen', sortOrder: 8, imageKey: 'basin-mixer',
    summary: 'Bathroom taps and faucets.',
    description: 'Taps and faucets for bathrooms. Add the finish and quantity you need to your project list.',
    range: ['Bathroom taps and faucets'],
  },
  {
    slug: 'kitchen-solutions', name: 'Kitchen sinks, equipment and cookware', groupLabel: 'Bathroom & kitchen', sortOrder: 9, imageKey: 'showroom',
    summary: 'Kitchen sinks, faucets, equipment, cookware, utensils and household utility products.',
    description: 'Practical, good-looking kitchen products for residential and commercial kitchens.',
    range: ['Kitchen sinks', 'Kitchen faucets and fittings', 'Kitchen equipment', 'Cookware and frying pans', 'Cooking pots and utensils', 'Kitchen accessories', 'Household utility products'],
  },
  {
    slug: 'tiles', name: 'Ceramic and porcelain tiles', groupLabel: 'Tiles & finishing', sortOrder: 10, imageKey: 'tiles-lobby',
    summary: 'Ceramic and porcelain floor and wall tiles, and decorative surfaces.',
    description: 'Tiles for property developers, interior designers, contractors and homeowners undertaking construction and renovation.',
    range: ['Ceramic tiles', 'Porcelain tiles', 'Floor and wall tiles', 'Decorative surfaces'],
  },
  {
    slug: 'interior-finishing', name: 'Interior finishing and architectural accessories', groupLabel: 'Tiles & finishing', sortOrder: 11, imageKey: 'tiles-living',
    summary: 'Interior finishing materials and selected architectural accessories.',
    description: 'Finishing materials that complete a space, for developers, designers and contractors.',
    range: ['Interior finishing materials', 'Selected architectural accessories'],
  },
];

export const BRANDS = [
  { slug: 'geepee', name: 'GEEPEE', note: 'The name appears on the supplied water-tank photographs. Confirm that St. Chris is an authorised distributor, and that the brand may be shown, before this goes live.' },
];

export interface SeedProduct {
  slug: string; name: string; category: string; brand: string | null; summary: string; description: string; highlights: string[]; specs: { label: string; value: string }[]; imageKeys: string[]; featured: boolean; sortOrder: number;
}

export const PRODUCTS: SeedProduct[] = [
  {
    slug: 'vertical-water-storage-tank-black', name: 'Vertical water storage tank, black', category: 'water-storage-tanks', brand: 'geepee', featured: true, sortOrder: 1,
    summary: 'A black, ribbed, vertical tank for above-ground water storage.',
    description: 'A vertical water storage tank with a ribbed body, shown here in black. Tell us the capacity you need and where it will be used (a house, a site or a development) and we will confirm the available sizes, fittings, price and delivery in a written quotation.',
    highlights: ['Vertical, ribbed body', 'Black finish', 'Capacity and fittings confirmed in your quotation'],
    specs: [{ label: 'Form', value: 'Vertical, ribbed' }, { label: 'Colour', value: 'Black' }, { label: 'Capacity', value: 'Confirmed in your quotation' }],
    imageKeys: ['tank-black-1', 'tank-black-2', 'tank-black-3'],
  },
  {
    slug: 'vertical-water-storage-tank-blue', name: 'Vertical water storage tank, blue', category: 'water-storage-tanks', brand: 'geepee', featured: true, sortOrder: 2,
    summary: 'A blue, ribbed, vertical tank for above-ground water storage.',
    description: 'The same style of vertical, ribbed tank in blue. Tell us the capacity you need and we will confirm the available sizes, price and delivery in a written quotation.',
    highlights: ['Vertical, ribbed body', 'Blue finish', 'Capacity and fittings confirmed in your quotation'],
    specs: [{ label: 'Form', value: 'Vertical, ribbed' }, { label: 'Colour', value: 'Blue' }, { label: 'Capacity', value: 'Confirmed in your quotation' }],
    imageKeys: ['tank-blue'],
  },
  {
    slug: 'three-piece-basin-mixer-chrome', name: 'Three-piece basin mixer set, chrome', category: 'taps-and-mixers', brand: null, featured: true, sortOrder: 1,
    summary: 'A chrome basin mixer set made up of a spout and two separate handles.',
    description: 'A three-piece basin mixer set in a chrome finish: a spout and two separate handles that fit to the basin or the vanity top. Add the quantity you need and we will confirm the model, price and delivery in a written quotation.',
    highlights: ['Spout and two separate handles', 'Chrome finish'],
    specs: [{ label: 'Pieces', value: 'Three (spout and two handles)' }, { label: 'Finish', value: 'Chrome' }],
    imageKeys: ['basin-mixer'],
  },
];

type F = {
  key: string; label: string; type: 'TEXT' | 'TEXTAREA' | 'NUMBER' | 'SELECT' | 'DATE' | 'BOOLEAN';
  required?: boolean; options?: string[]; unit?: string; helpText?: string; placeholder?: string; section?: string;
};

const dates = (from = 'Needed from', by = 'Needed by'): F[] => [
  { key: 'start_date', label: from, type: 'DATE', section: 'Timing', helpText: 'Earliest date you need the materials.' },
  { key: 'end_date', label: by, type: 'DATE', section: 'Timing', helpText: 'Latest acceptable date, if there is one.' },
];
const notes: F = { key: 'notes', label: 'Anything else we should know?', type: 'TEXTAREA', section: 'Additional information' };

export interface SeedService {
  slug: string; name: string; pillar: string; icon: string; imageKey: string | null; sortOrder: number; acceptsItems: boolean;
  summary: string; description: string; highlights: string[]; instructions: string; fields: F[];
}

export const SERVICES: SeedService[] = [
  {
    slug: 'materials-quotation', name: 'Quote my project list', pillar: 'Quotation', icon: 'list', imageKey: 'bathroom-suite', sortOrder: 1, acceptsItems: true,
    summary: 'Send the list you have built and get a written quotation. The usual route for contractors, developers, designers and homeowners.',
    description: 'Build a project list from the catalogue (or describe items in your own words), add the project details, and send it. The team reviews it, may come back with questions, and sends a written quotation that you can accept or decline online.\n\nSending a list is not an order. Availability, price and delivery are confirmed in the quotation.',
    highlights: ['One list for the whole project', 'A written quotation, accepted online', 'Reorder from past requests'],
    instructions: 'Check the lines on your list, then tell us about the project and where the materials are needed.',
    fields: [
      { key: 'project_name', label: 'Project or reference', type: 'TEXT', section: 'Project', placeholder: 'e.g. Block C bathrooms' },
      { key: 'project_type', label: 'What is it for?', type: 'SELECT', required: true, section: 'Project', options: ['New build', 'Renovation or refurbishment', 'Fit-out', 'Stock for resale', 'Maintenance', 'Other'] },
      { key: 'delivery_method', label: 'Delivery or collection', type: 'SELECT', required: true, section: 'Delivery', options: ['Deliver to site', 'I will collect', 'Not sure yet'] },
      { key: 'site_location', label: 'Site or delivery location', type: 'TEXT', required: true, section: 'Delivery', placeholder: 'Area and city, or full site address' },
      ...dates(),
      notes,
    ],
  },
  {
    slug: 'project-bulk-supply', name: 'Project and bulk supply', pillar: 'Projects', icon: 'briefcase', imageKey: 'tiles-living', sortOrder: 2, acceptsItems: true,
    summary: 'Structured supply for developments, hospitality fit-outs and institutional or corporate buyers.',
    description: 'For project-based and bulk requirements: residential and commercial developments, hotels and serviced apartments, offices and facilities. Attach a bill of quantities or schedule, add any lines you already know from the catalogue, and tell us the phasing.\n\nWe respond with a quotation; if the project is phased, tell us the phasing and we will say how it can be quoted.',
    highlights: ['Bill of quantities welcome', 'Tell us the phasing', 'One point of contact'],
    instructions: 'Attach your bill of quantities or schedule if you have one. You can also add catalogue lines you already know.',
    fields: [
      { key: 'project_name', label: 'Project name', type: 'TEXT', required: true, section: 'Project' },
      { key: 'project_type', label: 'Type of project', type: 'SELECT', required: true, section: 'Project', options: ['Residential development', 'Commercial development', 'Hotel or serviced apartments', 'Institutional or public', 'Industrial', 'Other'] },
      { key: 'site_location', label: 'Site location', type: 'TEXT', required: true, section: 'Project' },
      { key: 'phases', label: 'Phases and delivery schedule', type: 'TEXTAREA', section: 'Timing', helpText: 'For example: foundations in March, finishes from June.' },
      ...dates('Earliest delivery', 'Completion date'),
      { key: 'has_boq', label: 'I am attaching a bill of quantities or schedule', type: 'BOOLEAN', section: 'Additional information' },
      notes,
    ],
  },
  {
    slug: 'source-a-product', name: 'Source something specific', pillar: 'Sourcing', icon: 'search', imageKey: 'showroom', sortOrder: 3, acceptsItems: false,
    summary: 'Tell us what you are looking for and we will source it, locally or through importation.',
    description: 'Sourcing and importation are part of what St. Chris does: international product sourcing, supplier identification and procurement coordination. If you cannot find an item in the catalogue, describe it here with a photo, a model number or a link, and we will tell you what we can source.',
    highlights: ['Local and international sourcing', 'Photos, links and datasheets welcome', 'No obligation'],
    instructions: 'The more specific you are (brand, model, size, finish), the faster we can respond. Attach a photo or datasheet if you have one.',
    fields: [
      { key: 'product_description', label: 'What are you looking for?', type: 'TEXTAREA', required: true, section: 'Requirement', placeholder: 'Product, size, finish, standard or brand' },
      { key: 'quantity', label: 'Quantity', type: 'NUMBER', required: true, section: 'Requirement' },
      { key: 'quantity_unit', label: 'Unit', type: 'TEXT', section: 'Requirement', placeholder: 'e.g. pieces, cartons, sets' },
      { key: 'reference', label: 'Link or model number', type: 'TEXT', section: 'Requirement' },
      { key: 'site_location', label: 'Delivery location', type: 'TEXT', section: 'Delivery' },
      ...dates('Needed from', 'Needed by'),
      notes,
    ],
  },
  {
    slug: 'trade-account', name: 'Open a trade account', pillar: 'Accounts', icon: 'users', imageKey: 'bathroom-shower-heater', sortOrder: 4, acceptsItems: false,
    summary: 'For retailers, contractors, developers, designers, plumbers, hospitality and corporate buyers who buy regularly.',
    description: 'A trade account suits businesses that buy on a regular basis: building materials retailers, contractors, property developers, interior designers and architects, plumbing professionals, hospitality businesses and corporate buyers.\n\nTell us about your business and what you expect to buy. We review each application and contact you about terms; applying does not commit either side.',
    highlights: ['Saved project lists and reorders', 'Quotations accepted online', 'Request history in one place'],
    instructions: 'Use your business name and an email address your whole team can reach.',
    fields: [
      { key: 'business_type', label: 'Type of business', type: 'SELECT', required: true, section: 'Your business', options: ['Building materials retailer', 'Construction company or contractor', 'Property developer', 'Interior designer or architect', 'Plumbing professional', 'Hospitality business', 'Corporate or institutional buyer', 'Distributor or dealer', 'Other'] },
      { key: 'registration_number', label: 'Company registration number (RC)', type: 'TEXT', section: 'Your business', helpText: 'If your business is registered.' },
      { key: 'what_you_buy', label: 'What do you expect to buy?', type: 'TEXTAREA', required: true, section: 'Buying' },
      { key: 'order_frequency', label: 'How often do you buy?', type: 'SELECT', section: 'Buying', options: ['One-off or occasional', 'Monthly', 'Weekly', 'Project by project'] },
      { key: 'site_location', label: 'Where do you need delivery?', type: 'TEXT', section: 'Buying' },
      { key: 'references', label: 'Trade references (optional)', type: 'TEXTAREA', section: 'Additional information' },
    ],
  },
  {
    slug: 'dealer-partnership', name: 'Dealer or reseller partnership', pillar: 'Partnerships', icon: 'briefcase', imageKey: 'tiles-lobby', sortOrder: 5, acceptsItems: false,
    summary: 'For shops and distributors interested in carrying our product ranges.',
    description: 'We are building relationships with retailers, dealers and distributors to improve market access and product availability. Tell us about your outlet and which categories interest you, and the team will get in touch.',
    highlights: ['Wholesale and bulk supply', 'Dealer and reseller arrangements', 'Selected categories or the full range'],
    instructions: 'Tell us where you trade and which categories you want to carry.',
    fields: [
      { key: 'outlet_location', label: 'Where is your shop or outlet?', type: 'TEXT', required: true, section: 'Your business' },
      { key: 'categories_interest', label: 'Which categories interest you?', type: 'TEXTAREA', required: true, section: 'Your business' },
      { key: 'current_brands', label: 'Brands you stock today', type: 'TEXT', section: 'Your business' },
      notes,
    ],
  },
  {
    slug: 'supplier-introduction', name: 'Supplier or manufacturer introduction', pillar: 'Partnerships', icon: 'truck', imageKey: 'warehouse-pallets', sortOrder: 6, acceptsItems: false,
    summary: 'For manufacturers and suppliers who want to be considered for the Nigerian market.',
    description: 'St. Chris connects manufacturers and suppliers with the Nigerian market through sourcing, procurement coordination and structured distribution. Introduce your products and the team will respond if there is a fit.',
    highlights: ['Supplier identification and engagement', 'Importation and procurement coordination', 'Wholesale and project channels'],
    instructions: 'Attach a catalogue or price list if you have one.',
    fields: [
      { key: 'products_offered', label: 'What do you make or supply?', type: 'TEXTAREA', required: true, section: 'Your products' },
      { key: 'brands', label: 'Brands', type: 'TEXT', section: 'Your products' },
      { key: 'markets', label: 'Where do you supply today?', type: 'TEXT', section: 'Your products' },
      { key: 'catalogue_link', label: 'Link to your catalogue or website', type: 'TEXT', section: 'Your products' },
      { key: 'min_order', label: 'Minimum order and typical lead time', type: 'TEXT', section: 'Terms' },
      notes,
    ],
  },
  {
    slug: 'ask-a-question', name: 'Ask us a question', pillar: 'Questions', icon: 'mail', imageKey: null, sortOrder: 7, acceptsItems: false,
    summary: 'A general enquiry for anything that does not fit another route.',
    description: 'Use this for general questions, media or other enquiries. For a quotation, build a project list instead.',
    highlights: [],
    instructions: 'Tell us what your message is about and we will route it to the right person.',
    fields: [
      { key: 'topic', label: 'What is it about?', type: 'SELECT', required: true, section: 'Your message', options: ['A product or category', 'An existing request or quotation', 'Becoming a supplier or dealer', 'Media or other'] },
      { key: 'message', label: 'Your message', type: 'TEXTAREA', required: true, section: 'Your message' },
    ],
  },
];

export const FAQS = [
  { question: 'Is sending a project list an order?', answer: 'No. A project list asks us for a quotation. It is not an order, an accepted quotation or a commitment by either side. Price, availability and delivery come to you in a written quotation, which you can accept or decline.' },
  { question: 'Why are there no prices on the catalogue?', answer: 'Price and availability depend on quantity, size, brand and delivery, so we confirm them in your quotation rather than publish a number that may not apply to your job.' },
  { question: 'Do I need an account?', answer: 'No. You can build a list and send it without one. An account keeps your lists between visits and devices, shows the status of your requests, lets you accept or decline quotations online and lets you reorder from past requests.' },
  { question: 'What if I cannot find an item in the catalogue?', answer: 'Add it to your project list in your own words, or use “Source something specific”. Sourcing and importation are part of what St. Chris does.' },
  { question: 'Who do you supply?', answer: 'Individuals and homeowners, retailers and dealers, contractors, property developers, interior designers and architects, plumbing professionals, hospitality businesses and corporate or institutional buyers.' },
  { question: 'What is Sweethome?', answer: 'Sweethome is an affiliated brand of St. Chris Global focused on premium bathroom and kitchen products. It has its own online storefront at sweethomebathrooms.com, which suits retail purchases.' },
  { question: 'How long does a reply take?', answer: 'We aim to review every request promptly, but we have not published a fixed response time. Quote your reference number if you need to chase.' },
];

export interface SeedFact { id: string; label: string; value: string; source: string; verified: boolean; home?: boolean }

/** Factual claims. All unverified until St. Chris confirms them. */
export const FACTS: SeedFact[] = [
  { id: 'history-since', label: 'Business history dating back to', value: '2003', source: 'Corporate Profile §1: “according to available public company records”', verified: false, home: true },
  { id: 'rc-number', label: 'RC number', value: '493482', source: 'Corporate Profile §2. The profile asks for this to be reconfirmed with the Corporate Affairs Commission before external publication.', verified: false, home: false },
  { id: 'incorporated', label: 'Incorporation date', value: '26 September 2003', source: 'Corporate Profile §2. Reconfirm with the CAC before publication.', verified: false, home: false },
];

/** Customer segments from Corporate Profile §8, each pointing at the route that suits them. */
export const SEGMENTS = [
  { name: 'Contractors and construction companies', text: 'Building materials, plumbing products, sanitary ware and finishing supplies for construction projects.', to: '/services/materials-quotation', cta: 'Quote my project list' },
  { name: 'Property developers', text: 'Product sourcing and bulk supply for residential and commercial developments.', to: '/services/project-bulk-supply', cta: 'Project and bulk supply' },
  { name: 'Interior designers and architects', text: 'Bathroom, kitchen, sanitary ware and interior finishing products.', to: '/catalogue', cta: 'Browse the catalogue' },
  { name: 'Plumbing professionals', text: 'Plumbing materials, fittings, water heating products and installation accessories.', to: '/catalogue/plumbing-pipes-and-fittings', cta: 'Plumbing range' },
  { name: 'Retailers, dealers and distributors', text: 'Wholesale supplies and distribution partnerships for building materials merchants and independent dealers.', to: '/services/dealer-partnership', cta: 'Dealer partnership' },
  { name: 'Hospitality and corporate buyers', text: 'Bathroom, kitchen and utility products for hotels, serviced apartments, offices and facilities.', to: '/services/project-bulk-supply', cta: 'Project and bulk supply' },
  { name: 'Homeowners and individuals', text: 'Products for construction, renovation and home improvement. For retail purchases, Sweethome is our consumer-facing storefront.', to: '/sweethome', cta: 'About Sweethome' },
];
