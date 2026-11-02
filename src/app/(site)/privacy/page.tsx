import type { Metadata } from 'next';
import { PageHero, Section } from '@/components/blocks';
import { getSetting } from '@/server/settings';
import { getAnalytics } from '@/server/integrations/providers/analytics';
import { enabledMessagingChannels } from '@/server/integrations';

export const metadata: Metadata = { title: 'Privacy notice' };

export default async function PrivacyPage() {
  const [c, analytics, channels] = await Promise.all([getSetting('company'), getAnalytics(), enabledMessagingChannels()]);
  return (
    <>
      <PageHero eyebrow="Legal" title="Privacy notice" />
      <Section>
        <div className="prose-eu">
          <div className="alert alert-warn mb-8 !text-base"><p>This notice describes how this website handles personal data. It is a working draft and has not yet been reviewed by St. Chris’s legal advisers.</p></div>
          <h2>Who we are</h2>
          <p>{[c.legalName, c.address].filter(Boolean).join(', ')}.{c.email ? ` Contact: ${c.email}.` : ' To contact us about your data, use the “Ask us a question” form on this website.'}</p>
          <h2>What we collect</h2>
          <ul>
            <li><strong>Requests:</strong> your name, email, phone number, company, job title, the details of your requirement and any documents you upload.</li>
            <li><strong>Project lists:</strong> the items, quantities and notes you add. Before you sign in, your list is kept against a random token stored in a cookie in your browser; once you sign in it belongs to your account. It is not shared and is not a request until you send it.</li>
            <li><strong>Accounts:</strong> your name, email and a securely hashed password if you register.</li>
            <li><strong>Technical data:</strong> IP address and browser type, used for security, rate-limiting and audit records.</li>
          </ul>
          <h2>Why we use it</h2>
          <p>To respond to your request, prepare quotations, supply what you ask for, keep the portal secure, and meet legal obligations. We do not sell personal data.</p>
          <h2>Who can see it</h2>
          <p>Authorised St. Chris staff, according to their role. Documents are stored privately and shared only through short-lived signed links. Email delivery is handled by the email provider St. Chris configures.</p>
          <h2>How long we keep it</h2>
          <p>Retention periods have not yet been set by St. Chris. Until they are, request records are kept so that quotations and order history remain available.</p>
          <h2>Cookies</h2>
          <p>We use essential cookies to keep you signed in, to keep your project list between visits, and to remember your cookie choice. We do not use advertising cookies.</p>
          {analytics ? (
            <p>With your permission only, this website uses {analytics.provider === 'ga4' ? 'Google Analytics' : 'Plausible Analytics'} to count visits and see which pages are used. It is not loaded until you press Accept, it is not used on the staff console or the customer portal, and it is not loaded if your browser sends Do Not Track or Global Privacy Control. You can change your choice at any time with “Cookie settings” in the page footer.</p>
          ) : <p>Analytics are not enabled.</p>}
          {(channels.sms || channels.whatsapp) && (
            <>
              <h2>Status messages</h2>
              <p>If you tick the box on the request form, we send short status messages about that request by {[channels.sms ? 'SMS' : '', channels.whatsapp ? 'WhatsApp' : ''].filter(Boolean).join(' and ')} to the phone number you gave. They contain only the request reference and its status. Your phone number is shared with the messaging provider for this purpose. Ask us to stop at any time.</p>
            </>
          )}
          <h2>Your rights</h2>
          <p>You may ask to access, correct or delete your personal data. {c.email ? `Contact us at ${c.email}.` : 'Use the “Ask us a question” form on this website.'} Applicable law, including the Nigeria Data Protection Act, may give you further rights.</p>
        </div>
      </Section>
    </>
  );
}
