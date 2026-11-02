# Administrator guide

For the people who run the St. Chris Materials Desk day to day. Everything here is done in the browser at `/admin` (staff sign-in).

## Who can do what

| Role | Can | Cannot |
|---|---|---|
| **Super Admin** | Everything, including users, settings, integrations, audit log | — |
| **Operations Admin** | See and assign all requests, change status, notes, customers, follow-ups, reports, edit the catalogue, request types and website content | Create or approve quotations, manage users/settings |
| **Operations Staff** | See and work **only the requests assigned to them**: status, notes, information requests, follow-ups | See other requests, reports, quotations |
| **Commercial** | See all requests, notes, customers, create/edit/submit/issue quotations, reports, edit the catalogue and price book | Approve quotations, change request status directly |
| **Approver** | See requests and quotations, approve or return quotations, reports | Prepare or issue quotations |
| **Customer** | Own requests, quotations and documents in the portal | Anything in `/admin` |

Nobody can approve a quotation they prepared or submitted, whatever their role. An approver can be given a **personal approval limit** (Users page); quotations above it need someone else.

## A request, start to finish

1. **Received.** The customer gets an email with their reference (`SCG-2026-00001`); the configured internal recipients are told. If nobody is configured, all Super Admins and Operations Admins are told.
2. **Assign** it (request page → *Assign* panel). The assignee is emailed. Unassigned new requests are counted on the dashboard.
3. **Review.** Use *Ask the customer for more information* when something is missing. The request moves to *More information required*; the customer answers in the portal (or you record a phone/email reply with the communication form on the request) and it returns to *Under review*.
4. **Quote.** *New quotation* on the request page (Commercial / Super Admin). The quotation **starts from the customer's list**: one line per item they asked for, with the catalogue wording and SKU. Where a size has a price-book value it is filled in as a suggestion; any line still at 0 is flagged. Check every price, add or remove lines, set discount % and tax %. Totals are calculated by the server. *Save and submit for approval*.
5. **Approve.** An Approver opens it from *Quotations* (filter *Pending approval*) and approves, or returns it with a reason. If *Settings → Quotations → approval* is off, or the total is under the threshold, approval is skipped — this is recorded in the quotation's history.
6. **Issue.** Commercial issues an approved quotation. The customer is emailed; the request moves to *Quotation issued*; the validity clock starts. The PDF is available to staff and customer.
7. **Customer decides** in the portal. *Accept* (tick the authority box) moves the request to *Accepted*; *Decline* needs a reason and moves it to *Declined*. If the validity date passes first the quotation and request become *Expired* (done by the worker).
8. **Fulfil.** Staff move the request to *In progress* and *Completed* manually. The platform records the commercial process; it does not manage stock, payment or delivery runs.

To change an issued quotation, use *Create new revision* on the quotation: the old version is kept (*Superseded*) and the new one goes through approval again. *Withdraw* removes an issued quotation from customers with a reason.

*Declined, Cancelled and Closed* require a reason. Closed requests can be reopened to *Under review*.

### Phone, email and walk-in enquiries
Staff can record them against the customer (*Customers → company → note*) and attach messages to a request (*Add communication*). Customer-visible messages appear in the portal timeline and can email the customer.

## Customers (CRM)

*Customers* lists companies; each has contacts, requests, quotations, notes (note/call/meeting), documents and an owner. Guest submissions create or match a company by name and a contact by email. When a customer later registers **and verifies the same email address**, their earlier requests appear in the portal. An address that is not verified sees nothing.

## Follow-ups
*Follow-ups* are tasks with a due date, an assignee and an optional request/company. Overdue tasks show on the dashboard and in reports. Reminder emails go to the assignee when due (worker). Default follow-up intervals per status are in *Settings → Notifications*.

## Catalogue (Commercial, Operations Admin and above)

**Catalogue** in the console holds categories, products, sizes ("variants") and brands.

- **Categories** group the range on the website (Building materials, Water storage tanks, Sanitary ware, Tiles and so on). Each has a one-line summary and an optional list of "what we supply" lines; a visitor can add any of those lines to their list even before a product exists for it.
- **Products** have a name, summary, description, highlights, specification ("Label: value" per line), photos and a status. Only **Published** products are on the website. Imported products start as drafts flagged *needs review*.
- **Sizes and options** carry the SKU, unit of sale, availability and an **internal price-book value**. The price book is **never shown on the website, in search or in any public page**; it only pre-fills quotation lines for staff. SKUs are yours to assign: none are invented.
- **Brands** show on a product only while *Visible*. A brand created by CSV import is hidden until you confirm St. Chris may show it.
- **CSV**: *Export CSV* downloads the whole catalogue; *Import from CSV* creates or updates products and sizes (columns: category, product, summary, brand, size, sku, unit, price, availability, status). Categories must already exist. Nothing is deleted by an import. Rows that cannot be imported are listed with their row number.
- Deleting a product or size never rewrites history: past requests and quotations keep their own copy of the wording and SKU.

## Request types and forms (Operations Admin and above)

**Services** lists the ways a customer can ask: *Quote my project list*, *Project and bulk supply*, *Source something specific*, *Open a trade account*, *Dealer or reseller partnership*, *Supplier or manufacturer introduction* and *Ask us a question*. Each has its own questions, which you can add to, reorder, hide or make required. The tick **Carries a project list** decides whether the form shows the customer's list step (and refuses an empty one). Changing a form never changes requests already sent: their question labels are stored with them.

## Website content
**Content** holds the company pages (About, How quotations work), FAQs, the company facts register and the **Photos** library. Pages show draft wording written from the corporate profile until you edit them; *Reset* brings the draft back.

Photos are chosen from the library (or the supplied set) wherever a picture is needed: categories, products, request types and page headers. A photo that is in use cannot be deleted. Always write a real description (it is read aloud to people using screen readers).

## Reports
The *Dashboard* and *Reports* show measures for a date range, and *Reports* exports requests as CSV. Each measure has a plain-language definition listed on the page. **Percentages built on fewer than five cases are labelled "not enough data" rather than shown as a rate.** CSV cells that start with `=`, `+`, `-`, `@` are prefixed so spreadsheets do not run them as formulas.

## Settings (Super Admin)
- **Company details** — name, address, phone, contact email, hours: shown in the header/footer, emails and PDFs.
- **Quotations** — currency, validity, selectable tax rates (none are applied by default), default tax, payment terms, terms and conditions, introduction text, whether approval is required and from what total, whether customers may accept/decline online.
- **Company registration number** — optional, typed exactly as it should read (for example “RC 123456”). When set it appears in the footer and on the contact page; when empty nothing is shown.
- **Site announcement** — one line shown above the header on every public page (not in the console or portal), for something time-sensitive. Off by default. Optional link (a page on this site, or an https:// address) and an optional last day, after which it disappears by itself (Lagos time). Up to 160 characters.
- **Notifications** — who is told about new requests and approvals; which status changes email the customer; follow-up days per status.
- **Company facts register** — figures from the supplied profile (history from 2003, RC number, incorporation date). Each is marked unconfirmed until you tick **Verified**; nothing marked *home* appears on the home page until you decide to show it. Confirm or correct each with the source document. The home page's key-figures strip (activity history from, tractor heads and tank trailers, floating storage barges) reads its numbers from this register, so correcting a value here updates the home page. The WhatsApp number in Company details, if given with its country code, adds a chat link to the footer.

## Users (Super Admin)
Create staff with a role; they receive a link to choose their password (valid 72 hours) — passwords are never emailed or visible. Change a role, set an approval limit, or deactivate: sessions end immediately. You cannot change your own role or deactivate yourself, and there must always be one active Super Admin. Passwords are reset by the person through *Forgot password*; an admin cannot read or set one.

## Integrations (Super Admin)
Every connector is built in. To use one, open **Integrations**, fill in its card with your own credentials, tick *Switched on*, **Save**, then press its test button. A card says *On, last test passed* only after a test has succeeded with the saved credentials; until then it says *On, not yet verified*. Secrets are stored encrypted and are never shown again (leave a secret box blank to keep the stored one).

- **Email delivery** — SMTP, Resend, Postmark or SendGrid. When switched on it replaces the server's email settings. *Send a test email to me* sends to your own address.
- **SMS** and **WhatsApp** — status messages and "quotation ready" messages, only to customers who ticked the box on the request form. The boxes appear on the form only while the channel is switched on. WhatsApp needs two message templates approved by Meta (the card says what variables each takes). Messages are logged as *accepted by the provider*; delivery receipts are not collected.
- **Analytics** — Plausible or Google Analytics 4 on the public site only, behind a cookie notice. Nothing loads until a visitor accepts; Do Not Track is respected. The privacy page updates itself.
- **Outbound webhook** — signed JSON events (`request.submitted`, `request.status_changed`, `quotation.issued`, `quotation.accepted`, `quotation.declined`) to an `https://` endpoint, with `X-StChris-Signature: sha256=<HMAC of body>`.
- **CRM, accounting, delivery and dispatch, stock and inventory, documents** — each calls the other system's REST API using an **event mapping** that you (or your integrator) write as JSON: for each event, the HTTP method, the path and the JSON body, with placeholders such as `{{data.reference}}`. *Show an example mapping* on each card gives the shape. The example's paths and fields are placeholders: replace them with the ones in the other system's API documentation. The documents connector can attach the quotation PDF with `{{pdf_base64}}`. Fleet hand-off shows no live tracking and none is implied.

A failing delivery is retried with back-off and every attempt is listed under *Recent activity* on the card. A broken connector never blocks a request or a quotation.

## Staff sign-in security (everyone) and Settings → Security (Super Admin)
*Account → Security* lets each staff member set up an authenticator app (scan the QR code, enter the first code) and download ten one-time recovery codes. A Super Admin can switch on *require two-factor for all staff* in **Settings → Security**, and can reset a colleague's second factor from **Users** if a phone is lost.

## Recording an offline decision on a quotation (Super Admin and Commercial Staff)
If a customer accepts or declines by phone, paper, email, WhatsApp or in a meeting, open the issued quotation and use **Record an offline answer**: choose the decision, how it was given, who gave it and when, and add a note or attach the evidence. It is audited, shown on the quotation and the customer's portal, and cannot overwrite a decision already made.

## Uploads and virus scanning
Every upload is scanned. A file that is rejected is not stored. If the scanner is unavailable the file is held (listed with its scan status, not downloadable) and is scanned again automatically.

## Email outbox and audit log
*Email outbox* lists every message with its status: *Queued*, *Sent* (accepted by the provider), *Skipped* (no provider configured), *Failed* (gave up after retries). *Audit log* shows who did what and when (sign-ins, status changes, quotation steps, document downloads, user and settings changes, exports). Neither can be edited from the console.

## Everyday problems
| Symptom | Likely cause |
|---|---|
| Customers say they received no email | Outbox shows *Skipped*: no provider configured. *Queued* for long: the worker is not running. *Failed*: read the error on the row |
| A customer cannot see their old requests | Their account email is not verified, or they registered with a different address |
| A user is locked out | 8 wrong passwords lock the account for 15 minutes. They can use *Forgot password* |
| "Too many requests" on submission | Rate limit (8 per 10 minutes per address). Wait or phone |
| Quotation can't be approved by me | You prepared/submitted it, or it exceeds your approval limit |

## Executive platform: journal, social, media, staff portal

### Roles
| Role | Can do |
|---|---|
| Super admin | Everything |
| Operations admin | Operations plus divisions, opportunities, staff portal, insights |
| Content manager | Write and publish journal articles, executive profile, divisions, opportunities, media centre, SEO, publish to social, insights. Cannot manage accounts or users |
| Communications | Journal, media centre, staff portal, **connect and manage social accounts**, publish to social, insights, handle assigned enquiries |
| Staff member | The staff portal only (`/staff`). Signs in at the same page, never sees the console or customer data |
Create people and set roles under **Users and roles**. Role changes end that person's sessions at once.

### Publishing an article (works on a phone)
1. **Journal → Write an article.** Title, summary, then write. The toolbar adds bold, headings, quotes, lists, links and pictures from the camera roll. A draft is also kept in the phone's browser if the tab closes.
2. Choose a category and add tags. Add a featured picture and, optionally, a YouTube or Vimeo link. Check the Google preview and edit the search title and description.
3. Under **Share**, tick each channel that should get it. Each channel has its own caption, hashtags and "include the link" setting, with a live preview and character count for that platform.
4. **Save draft**, **Preview**, **Schedule** (Lagos time) or **Publish now**. Published articles can be edited, taken off the site (Unpublish or Remove) and restored.
An article with any `[[unfinished]]` marker cannot be published.

### What happens to social posts
Publishing queues one post per ticked channel. Each shows its status under **Social queue**: *Sending*, *Posted* (with a link), *Failed* (with the platform's reason; it retries automatically and can be retried by hand) or *Post by hand* (the text is ready to copy, with a button to open the platform). Accounts set to "I post by hand", platforms that refuse a format, and expired tokens all fall back to *Post by hand* and email the team. The system never claims a post went out unless the platform confirmed it. Read `OUTSTANDING_ITEMS.md` §F before relying on automatic posting.

### Other areas
- **Executive profile**: headline, portrait, story sections, social links, career/leadership timeline and GeePee milestones and testimonials. Only add true, approved material.
- **Divisions / Opportunities**: each gets its own public page; opportunities have a closing date and an "Express interest" button that opens the right enquiry form.
- **Media centre**: press releases, interviews, speaking, announcements, commentary, mentions, photos and videos.
- **SEO**: Search Console code, default share picture, page-by-page titles, descriptions, share pictures and "hide from search".
- **Departments**: each kind of enquiry is routed to a department; set the department's email address(es) here and the department of each request type under **Request types**.
- **Staff portal**: announcements, circulars, department updates, approved documents (scanned before staff can open them).
- **Insights**: article reads, enquiries by department/type/source, social outcomes. Visitor behaviour is in GA4; search performance is in Search Console.
