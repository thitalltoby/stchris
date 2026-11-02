import { Logo } from '@/components/Logo';
export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-umber">
      <div className="container-x py-8"><Logo reversed height={36} /></div>
      <div className="bg-paper">{children}</div>
    </div>
  );
}
