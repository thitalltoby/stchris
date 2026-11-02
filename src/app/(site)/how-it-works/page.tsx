import type { Metadata } from 'next';
import { SectionPageView } from '@/components/SectionPageView';
import { getSectionContent } from '@/server/section-pages';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> { const c = await getSectionContent('how-it-works'); return { title: 'How quotations work', description: c?.intro }; }
export default function Page() { return <SectionPageView path="how-it-works" />; }
