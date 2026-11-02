# Content register

Everything on the site that comes from the supplied corporate profile and photographs, with what is claimed, what is **not** claimed, and what St. Chris must confirm before launch. Nothing here has been verified by us. Nothing was invented to fill a gap: where the profile was silent the site is silent too.

## 1. Facts

| Item | Where it appears | Source | What to confirm |
|---|---|---|---|
| Business history "dating back to 2003" | Home page (fact marked *home*), About | Profile §1: "according to available public company records" | Shown hedged, as unverified, until ticked **Verified** in *Settings → facts*. Confirm the history and whether to keep the wording |
| RC number 493482 | **Not shown by default.** Held in the facts register | Profile §2 (the profile itself says to reconfirm with the CAC before external publication) | Check with the Corporate Affairs Commission; then type it into *Settings → Company registration number* to show it in the footer and contact page |
| Incorporation date 26 September 2003 | Facts register only | Profile §2 (reconfirm with the CAC) | As above |
| Business-to-business and business-to-consumer | About | Profile | Confirm the wording |
| Tagline "Building Better Spaces. Delivering Quality." | Header strip, footer | Profile | Confirm it is current |
| Vision, mission and values | About (draft body) | Profile | Confirm and edit in *Content → Pages* |
| Customer segments | Services and About | Profile §8 | Confirm |
| Relationship to Sweethome | Header, footer, Sweethome page | Profile; storefront at sweethomebathrooms.com | Confirm "affiliated brand" is the correct description, and that St. Chris may link to the storefront |

## 2. Contact details: none supplied

The profile contains no address, telephone, email, WhatsApp number or opening hours. The site shows **none**; the Contact page says so plainly and offers the request form. Enter them in *Settings → Company details* and they appear in the header, footer, contact page, emails and quotation PDFs.

## 3. Prices, SKUs, delivery and terms: none supplied

- No price is shown anywhere publicly. The **price book** (a value per size) is internal, pre-fills quotation lines and is stripped from every public read (tested).
- No SKU was supplied. Sizes and SKUs are entered or imported by staff.
- No delivery area, lead time, returns, warranty, payment or credit terms are stated. Quotation payment terms and T&Cs default to empty, and nothing is invented for you.
- No tax rate is applied by default.

## 4. Catalogue

| Item | Note |
|---|---|
| 11 categories | Taken from profile §6.1–6.6: building materials; water storage tanks; waste management products; plumbing pipes, fittings and valves; water heaters; sanitary ware; baths and showers; taps and mixers; kitchen solutions; tiles; interior finishing. Each has "what we supply" lines from the profile |
| 3 products | Only the products visible in the supplied photographs: vertical water storage tank (black), vertical water storage tank (blue), three-piece basin mixer set (chrome). Capacities, sizes and specifications were not visible, so none are stated ("confirmed in your quotation") |
| Brand "GEEPEE" | The name appears on the tank photographs. The brand is seeded **hidden**, so no "Brand: GEEPEE" text appears. The name is still visible on the product photographs themselves. Confirm St. Chris is an authorised distributor and may show the brand, then make it visible in *Catalogue → Brands*, or replace the photographs |
| Everything else | Add through *Catalogue*, or CSV import. Imported products are drafts flagged *needs review* |

## 5. Images

13 photographs are in `public/photos/`, used for categories, products and page headers. Descriptions (alt text) are in `src/content/photos.ts`.

| Check | Why |
|---|---|
| Who made them, and may St. Chris use them commercially? | We were given the files, not their licence |
| Some look AI-generated or composited (for example the bathroom mood-board and room scenes). Replace them with real photographs of real stock or projects before launch, or label them as illustrative | Honesty to customers. The terms page already says "Some photographs are illustrative" |
| Product photos show a manufacturer's brand | See GEEPEE above |
| The showroom image | Confirm it is a real St. Chris or Sweethome showroom. If not, remove it: the site never says it is |

## 6. Brand assets

| Item | Note |
|---|---|
| Logo | Supplied PNGs are in `public/brand/` (full colour, reversed, emblem, app icon). A vector (SVG) master would be better for print and the quotation PDF |
| TT Firs Neue | Licensed typeface, **not bundled**. Add the `.woff2` files to `public/fonts/` (see `public/fonts/README.txt`); until then Figtree and IBM Plex are used |
| Colours | `#F96D11` (brand) and `#B4430A` (accessible text colour) were taken from the logo. Confirm against the brand guidelines |

## 7. Legal

The privacy notice, terms of use and cookie notice are **drafts**. They need review by St. Chris's legal adviser, including Nigeria Data Protection Act obligations, retention periods and the identity of the data controller.

## 8. Claims the site deliberately does not make

Years of experience beyond the hedged 2003 history; number of customers, projects or products; certifications or standards; "authorised dealer" status; stock levels; delivery speed or coverage; guarantees; "lowest price"; reviews or testimonials; named clients or people.

## 9. Executive and corporate platform additions (unverified: client to confirm)

| Item | Status |
|---|---|
| **Chris Iyoha profile copy** (three sections, closing line) | **Written from the project brief only.** The biography paragraphs that were pasted in the original conversation could not be recovered, so this text is a stand-in and contains no dates, employers, titles, qualifications or awards. The supplied headline, strapline, section headings and closing line are used exactly. **Replace with Chris's approved biography** under Admin → Executive profile before launch |
| **Career, leadership and training timeline** | Empty by design. Nothing is shown until staff add true, approved entries (Admin → Executive profile) |
| **Division descriptions** (six divisions) | Restate what the corporate profile says. Flagged "needs review" in Admin → Divisions. No distributorship, certification or brand claims are made beyond the profile |
| **GeePee Tanks feature** | A guarded **draft skeleton**. It contains `[[…]]` markers where facts are needed (how the relationship began, dates, milestones, quotes) and **cannot be published until every marker is replaced**. Milestones and testimonials come from Admin → Executive profile → GeePee Tanks feature. The site names GeePee tanks as products in the photographs supplied; it does not claim authorised-distributor status |
| **Photographs** | Supplied portrait, meeting photo and three further tank photos are used. A café-branded photo supplied was **not used** (third-party branding, no permission recorded). Four `.avif` attachments were ignored |
| **Social profile addresses** | Blank until entered |
| **Opportunities** | None are pre-published. Staff add the real ones |
| **Media centre** | Empty until staff add real items |
| **Company phone, WhatsApp number, address** | Still blank (see section 2). The WhatsApp buttons appear only once a number is entered under Settings → Company |
