import type { Metadata } from 'next';
import { SectionPageView } from '@/components/SectionPageView';
import { getSectionContent } from '@/server/section-pages';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> { const c = await getSectionContent('sweethome'); return { title: 'Sweethome', description: c?.intro }; }
export default function Page() { return <SectionPageView path="sweethome" />; }
