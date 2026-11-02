import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GEEPEE } from '@/content/geepee';
import { buildNav } from '@/content/nav';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'generated' || name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|css|json|md)$/.test(name)) out.push(p);
  }
  return out;
}

describe('content rules', () => {
  it('never mentions Sweethome in the source, seed data or site copy', () => {
    const offenders = [...walk('src'), ...walk('prisma')].filter((f) => /sweet ?home/i.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('states the GeePee role consistently', () => {
    expect(GEEPEE.line).toContain('Major distributor & strategic partner of GeePee Water Tanks');
    expect(GEEPEE.line).toContain("Africa's No. 1 Water Tank Manufacturer");
  });

  it('puts the GeePee partnership in the main navigation', () => {
    const nav = buildNav({ categories: [], divisions: [], journalCategories: [], geepeeLive: false });
    const g = nav.find((n) => n.href === GEEPEE.hub);
    expect(g?.label).toBe('GeePee Partnership');
    expect(g?.children?.map((c) => c.href)).toContain('/catalogue/water-storage-tanks');
    expect(JSON.stringify(nav)).not.toMatch(/sweet/i);
  });
});
