import type { Metadata } from 'next';
import { PageHero, Section } from '@/components/blocks';

export const metadata: Metadata = { title: 'Terms of use' };

export default function TermsPage() {
  return (
    <>
      <PageHero eyebrow="Legal" title="Terms of use" />
      <Section>
        <div className="prose-eu">
          <div className="alert alert-warn mb-8 !text-base"><p>These terms are a working draft and have not yet been reviewed by St. Chris’s legal advisers.</p></div>
          <h2>Project lists and requests are not orders</h2>
          <p>Building a project list, or sending it as a request, is not an order, an accepted quotation or a commitment by either party. Prices, availability, delivery and commercial terms apply only when set out in a written quotation that you accept.</p>
          <h2>Information you provide</h2>
          <p>Please give accurate information. Do not upload files you are not entitled to share, or files containing malware.</p>
          <h2>Website content</h2>
          <p>Product descriptions, images and company information are provided for general information and do not confirm current availability, specification, brand or price. These are confirmed in the quotation we send you. Some photographs are illustrative.</p>
          <h2>Accounts</h2>
          <p>Keep your sign-in details confidential. Tell us promptly if you believe your account has been used without your permission.</p>
        </div>
      </Section>
    </>
  );
}
