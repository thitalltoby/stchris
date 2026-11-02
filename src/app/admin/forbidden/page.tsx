import Link from 'next/link';
import { AuthCard } from '@/components/AuthCard';
export const metadata = { title: 'No access', robots: { index: false } };
export default function Forbidden() {
  return <div className="bg-paper min-h-screen"><AuthCard title="You do not have access to that page" intro="Your role does not include this area. If you need it, ask a Super Admin." footer={<p><Link href="/admin">Back to the console</Link></p>}><p className="text-sm text-steel">Access is enforced on the server for every action, not only in the menu.</p></AuthCard></div>;
}
