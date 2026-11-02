import Image from 'next/image';
import { db } from '@/server/db';
import { isServable } from '@/server/scan';

import { PHOTO_ALT } from '@/content/photos';

/** Where to anchor a crop so the subject stays in frame. Product photographs on white are shown whole ("contain"). */
const POSITION: Record<string, string> = { 'chris-portrait': 'center 22%', 'leadership-meeting': 'center 40%', 'bathroom-suite': 'center 60%', 'tiles-lobby': 'center 55%', 'tiles-living': 'center 60%', 'showroom': 'center 65%', 'warehouse-pallets': 'center 55%', 'bathroom-shower-heater': 'center 45%' };
const PRODUCT_SHOTS = new Set(['tank-black-1', 'tank-black-2', 'tank-black-3', 'tank-black-4', 'tank-black-5', 'tank-black-6', 'tank-blue', 'basin-mixer']);

/** A photo by supplied key ("tank-blue") or library reference ("media:<id>"). A library photo that is missing or held back by the scan shows the plain brand block instead. */
export async function Photo({ name, className = '', sizes = '(min-width: 1024px) 50vw, 100vw', priority = false, alt, fit }: { name: string | null | undefined; className?: string; sizes?: string; priority?: boolean; alt?: string; fit?: 'cover' | 'contain' }) {
  if (name?.startsWith('media:')) {
    const doc = await db.document.findFirst({ where: { id: name.slice(6), visibility: 'PUBLIC', section: 'media' }, select: { id: true, title: true, scanStatus: true } });
    if (!doc || !isServable(doc.scanStatus)) return <Photo name={null} className={className} />;
    return (
      <div className={`photo-frame photo-zoom ${fit === 'contain' ? 'bg-white' : ''} ${className}`}>
        <Image src={`/media/${doc.id}`} quality={85} alt={alt ?? doc.title ?? ''} fill sizes={sizes} priority={priority} style={fit === 'contain' ? { objectFit: 'contain' } : undefined} />
      </div>
    );
  }
  if (!name) {
    return (
      <div className={`photo-frame ${className}`} aria-hidden="true">
        <div className="absolute inset-0 bg-umber" />
        <div className="tiers absolute bottom-6 left-6 w-24"><span /><span /><span /></div>
      </div>
    );
  }
  const contain = (fit ?? (PRODUCT_SHOTS.has(name) ? 'contain' : 'cover')) === 'contain';
  return (
    <div className={`photo-frame photo-zoom ${contain ? 'bg-white' : ''} ${className}`}>
      <Image src={`/photos/${name}.jpg`} quality={85} alt={alt ?? PHOTO_ALT[name] ?? ''} fill sizes={sizes} priority={priority} style={{ objectPosition: POSITION[name] ?? 'center', ...(contain ? { objectFit: 'contain' as const } : {}) }} />
    </div>
  );
}
