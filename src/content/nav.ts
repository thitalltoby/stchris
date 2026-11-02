/** Main navigation. Parents with children get a dropdown whose first row is "Go to: <parent>". */
export interface NavNode {
  label: string;
  href: string;
  children?: NavNode[];
}

export interface NavInput {
  categories: { name: string; slug: string }[];
  divisions: { name: string; slug: string }[];
  journalCategories: { name: string; slug: string }[];
  /** The GeePee Tanks feature is listed only once it has been published */
  geepeeLive: boolean;
}

/** Built per request: categories, divisions and journal categories come from the database, so staff changes show up in the menu. */
export function buildNav(i: NavInput): NavNode[] {
  return [
    {
      label: 'Chris Iyoha',
      href: '/chris-iyoha',
      children: [
        { label: 'Executive profile', href: '/chris-iyoha' },
        { label: 'Leadership, Career & Opportunities', href: '/leadership' },
      ],
    },
    {
      label: 'St. Chris Global',
      href: '/about',
      children: [
        { label: 'Our divisions', href: '/divisions', children: i.divisions.map((d) => ({ label: d.name, href: `/divisions/${d.slug}` })) },
        { label: 'Catalogue', href: '/catalogue', children: i.categories.map((c) => ({ label: c.name, href: `/catalogue/${c.slug}` })) },
        { label: 'How quotations work', href: '/how-it-works' },
      ],
    },
    {
      label: 'GeePee Partnership',
      href: '/partnerships/geepee',
      children: [
        { label: 'Major distributor of GeePee Water Tanks', href: '/partnerships/geepee' },
        ...(i.geepeeLive ? [{ label: 'The partnership story', href: '/partnerships/geepee-tanks' }] : []),
        { label: 'Water storage tanks', href: '/catalogue/water-storage-tanks' },
        { label: 'Become a dealer', href: '/services/dealer-partnership' },
      ],
    },
    {
      label: 'Journal & Media',
      href: '/journal',
      children: [
        { label: 'The journal', href: '/journal', children: i.journalCategories.map((c) => ({ label: c.name, href: `/journal/category/${c.slug}` })) },
        { label: 'Media centre', href: '/media-centre' },
      ],
    },
    {
      label: 'Opportunities',
      href: '/opportunities',
      children: [
        { label: 'All opportunities', href: '/opportunities' },
        { label: 'Ways to buy', href: '/services' },
      ],
    },
    { label: 'Contact', href: '/contact' },
  ];
}
