/**
 * How the site describes the GeePee relationship, in one place so every page says the same thing.
 * The role ("major distributor and strategic partner") and the manufacturer description were supplied by the client.
 * "Africa's No. 1 Water Tank Manufacturer" is how GeePee describes itself (geepee.com). Both need written confirmation
 * from GeePee before launch; see docs/CONTENT_REGISTER.md.
 */
export const GEEPEE = {
  name: 'GeePee Water Tanks',
  group: 'GeePee Group',
  site: 'https://geepee.com',
  claim: "Africa's No. 1 Water Tank Manufacturer",
  role: 'Major distributor and strategic partner',
  /** One line used in the top bar, footer and badges */
  line: "Major distributor & strategic partner of GeePee Water Tanks, Africa's No. 1 Water Tank Manufacturer",
  /** Shorter form for tight places */
  short: 'Major distributor & strategic partner of GeePee Water Tanks',
  hub: '/partnerships/geepee',
  story: '/partnerships/geepee-tanks',
} as const;
