import { SiteHeader } from '@/components/SiteHeader';
import { SiteNotice } from '@/components/SiteNotice';
import { SiteFooter } from '@/components/SiteFooter';
import { ConsentAnalytics } from '@/components/ConsentAnalytics';
import { Reveal } from '@/components/Reveal';
import { getAnalytics } from '@/server/integrations/providers/analytics';

export const dynamic = 'force-dynamic';

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const analytics = await getAnalytics();
  return (
    <div className="ed">
      <Reveal />
      <a href="#main" className="skip-link">Skip to content</a>
      <SiteNotice />
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter cookieSettings={!!analytics} />
      {analytics && <ConsentAnalytics cfg={analytics} />}
    </div>
  );
}
