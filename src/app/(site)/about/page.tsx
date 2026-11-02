import type { Metadata } from 'next';
import { SectionPageView } from '@/components/SectionPageView';
import { getSectionContent } from '@/server/section-pages';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> { const c = await getSectionContent('about'); return { title: 'About', description: c?.intro }; }
export default function Page() { return <SectionPageView path="about" />; }
