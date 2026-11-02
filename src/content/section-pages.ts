/**
 * Editable website pages (About, Sweethome, How quotations work). The default text is drawn from the supplied
 * Corporate Profile or describes how this platform works. It states no figure, date, address, price, partner or policy
 * that the profile does not give. Staff can edit every page in the console (Content → Pages) once St. Chris has
 * confirmed what it wants to say.
 */
export interface SectionPageDef {
  path: string; // without leading slash
  title: string;
  navLabel: string;
  eyebrow: string;
  intro: string;
  photo?: string;
  /** Page lists uploaded public documents (for example a brochure or price list) */
  documents?: boolean;
  defaultBody: string;
}

export const SECTION_PAGES: SectionPageDef[] = [
  {
    path: 'about',
    title: 'Building better spaces',
    navLabel: 'About St. Chris',
    eyebrow: 'About St. Chris Global',
    intro: 'A diversified Nigerian enterprise in building materials, bathroom and kitchen solutions, plumbing, tiles and home improvement, serving both trade and retail customers.',
    photo: 'warehouse-pallets',
    defaultBody: `## Who we are

St. Chris Global Limited is a diversified Nigerian business with interests spanning building materials, construction supplies, bathroom and kitchen solutions, sanitary ware, plumbing products, water storage solutions, tiles, interior finishing and home improvement products.

We work across sourcing, importation, procurement, wholesale and retail distribution, serving individuals, retailers, contractors, property developers, construction companies, corporate organisations and institutional buyers. According to available public company records, our business history dates back to 2003.

## How we supply

- **Wholesale and B2B distribution:** bulk sales and commercial arrangements for retailers, distributors, contractors, developers and corporate customers.
- **Retail and B2C:** direct retail to individuals and homeowners, including through our affiliated brand [Sweethome](/sweethome).
- **Importation and procurement:** sourcing products from local and international manufacturers and suppliers.
- **Project and institutional supply:** structured sourcing and supply for commercial and project-based requirements.

## Our vision

To become a leading and trusted diversified building materials and home solutions enterprise, recognised for quality products, dependable supply, strong commercial partnerships and exceptional customer service across Nigeria and selected international markets.

## Our mission

To source, import, supply and distribute quality building materials, bathroom and kitchen solutions, and home improvement products through strategic partnerships, efficient procurement, competitive commercial practices and customer-focused service.

## What we value

- **Integrity:** honesty, transparency and accountability.
- **Quality:** dependable products and responsible sourcing.
- **Reliability:** consistent supply and service.
- **Customer commitment:** understanding and responding to the needs of our customers and business partners.
- **Innovation:** technology, new products and better business processes.
- **Partnership:** lasting relationships with manufacturers, suppliers, distributors and customers.
- **Excellence:** professional standards across our commercial and operational activities.

## Where we are going

We are strengthening our presence in Lagos, expanding across Nigeria, and developing selected international supplier and market relationships. The Materials Desk you are using is part of that: a clearer way to browse, list what you need, and get a written quotation.`,
  },
  {
    path: 'sweethome',
    title: 'Sweethome: premium bathroom and kitchen solutions',
    navLabel: 'Sweethome',
    eyebrow: 'Affiliated brand',
    intro: 'Sweethome is the consumer-facing brand of the St. Chris Global group, with its own online storefront.',
    photo: 'basins-double',
    defaultBody: `## What Sweethome is

Sweethome is an affiliated brand focused on premium bathroom and kitchen products, sanitary ware, tiles, kitchen equipment, utensils and home improvement solutions. It is positioned for customers who want products that improve the function, comfort and look of their homes and commercial spaces.

St. Chris Global Limited is the overarching corporate identity; Sweethome has its own customer-facing identity and offer.

## What Sweethome offers

- Bathroom equipment
- Sanitary ware
- Wash basins and bathroom fittings
- Kitchen equipment
- Kitchen utensils and cookware
- Water heaters
- Tiles and interior solutions
- Selected household and home improvement products

## Which one should I use?

**For a single purchase or a home project,** Sweethome is the retail storefront: [sweethomebathrooms.com](https://sweethomebathrooms.com).

**For trade, project or bulk supply,** or for a quotation on a longer list, use this Materials Desk: [build a project list](/list).`,
  },
  {
    path: 'how-it-works',
    title: 'How quotations work',
    navLabel: 'How quotations work',
    eyebrow: 'The Materials Desk',
    intro: 'From a project list to a written quotation you can accept online, in four steps.',
    photo: 'showroom',
    defaultBody: `## 1. Build a list

Browse the catalogue and add what you need, with quantities and notes. If something is not listed, describe it in your own words. Your list saves as you go and follows you to your account if you sign in. Nothing is sent, and nothing is ordered, until you choose to send it.

## 2. Send it for a quotation

Tell us about the project and where the materials are needed, then send the list. You get a reference number straight away and an email confirmation.

## 3. We review and quote

The team reviews your request, may come back with questions, and prepares a written quotation. Price, availability, brand, delivery and terms are set out in the quotation, because they depend on what you are buying and where it is going.

## 4. Accept online

When your quotation is ready you can read it, download it as a PDF, and accept or decline it from your account. If you need a change, ask and we will issue a revised version. Accepting is recorded against your account and the version you accepted.

## Reordering

Past requests stay in your account. Open one and reorder it, and the lines go back onto a fresh project list.

## What this page does not promise

We have not published delivery times, payment terms or returns terms here. They are confirmed in each quotation.`,
  },
];

export const sectionPageByPath = (path: string) => SECTION_PAGES.find((p) => p.path === path);
