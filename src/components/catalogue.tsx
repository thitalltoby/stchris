import Link from 'next/link';
import { Photo } from './Photo';
import { Icon } from './Icon';

export type CategoryCardData = { slug: string; name: string; summary: string; imageKey: string | null; productCount: number; range: string[] };

/** Category tile: photograph, name and a count of what is in it. The "range" count is the number of product lines we list. */
export function CategoryCard({ c, priority = false }: { c: CategoryCardData; priority?: boolean }) {
  return (
    <Link href={`/catalogue/${c.slug}`} className="group block no-underline border border-line bg-white hover:border-charcoal transition-colors">
      {c.imageKey
        ? <Photo name={c.imageKey} className="aspect-[4/3]" sizes="(min-width: 1024px) 22vw, (min-width: 640px) 45vw, 100vw" priority={priority} />
        : <div className="aspect-[4/3] bg-paper-2 grid place-items-center text-steel" aria-hidden="true"><Icon name="layers" size={40} /></div>}
      <div className="p-4 md:p-5">
        <h3 className="text-[1.1rem] group-hover:text-ember">{c.name}</h3>
        <p className="mt-1.5 text-sm text-steel line-clamp-3">{c.summary}</p>
        <p className="mt-3 mono text-xs text-steel">{c.productCount > 0 ? `${c.productCount} ${c.productCount === 1 ? 'product' : 'products'} · ` : ''}{c.range.length} {c.range.length === 1 ? 'line' : 'lines'} we supply</p>
      </div>
    </Link>
  );
}

export type ProductCardData = { slug: string; name: string; summary: string; imageKeys: string[]; brand: { name: string; visible: boolean } | null; variants: unknown[] };

export function ProductCard({ p }: { p: ProductCardData }) {
  return (
    <Link href={`/products/${p.slug}`} className="group block no-underline border border-line bg-white hover:border-charcoal transition-colors">
      <Photo name={p.imageKeys[0] ?? null} className="aspect-square" sizes="(min-width: 1024px) 22vw, (min-width: 640px) 45vw, 100vw" fit="contain" />
      <div className="p-4 border-t border-line">
        {p.brand?.visible && <p className="eyebrow !text-steel">{p.brand.name}</p>}
        <h3 className="text-[1.05rem] mt-1 group-hover:text-ember">{p.name}</h3>
        <p className="mt-1.5 text-sm text-steel line-clamp-2">{p.summary}</p>
        {p.variants.length > 1 && <p className="mt-2 mono text-xs text-steel">{p.variants.length} sizes</p>}
      </div>
    </Link>
  );
}
