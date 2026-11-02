import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { CATEGORIES, BRANDS, PRODUCTS, SERVICES, FAQS, FACTS } from '../src/content/seed-content';
import { DEFAULTS } from '../src/server/settings-defaults';
import { JOURNAL_CATEGORIES } from '../src/content/journal';
import { SERVICE_ROUTING, PLATFORM_SERVICES, DIVISIONS, GEEPEE_BODY, GEEPEE_SLUG, GEEPEE_TITLE } from '../src/content/seed-platform';

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  // Catalogue, request types and FAQs are create-only: edits made in the console are never overwritten by a re-seed.
  for (const c of CATEGORIES) {
    if (await db.category.findUnique({ where: { slug: c.slug } })) continue;
    await db.category.create({ data: { slug: c.slug, name: c.name, groupLabel: c.groupLabel, summary: c.summary, description: c.description, range: c.range, imageKey: c.imageKey, sortOrder: c.sortOrder, needsReview: true } });
  }
  for (const b of BRANDS) {
    if (await db.brand.findUnique({ where: { slug: b.slug } })) continue;
    await db.brand.create({ data: { slug: b.slug, name: b.name, note: b.note, visible: false } });
  }
  for (const p of PRODUCTS) {
    if (await db.product.findUnique({ where: { slug: p.slug } })) continue;
    const category = await db.category.findUnique({ where: { slug: p.category } });
    const brand = p.brand ? await db.brand.findUnique({ where: { slug: p.brand } }) : null;
    if (!category) continue;
    await db.product.create({ data: { slug: p.slug, name: p.name, categoryId: category.id, brandId: brand?.id ?? null, summary: p.summary, description: p.description, highlights: p.highlights, specs: p.specs, imageKeys: p.imageKeys, featured: p.featured, sortOrder: p.sortOrder, status: 'PUBLISHED', needsReview: true } });
  }
  for (const s of [...SERVICES, ...PLATFORM_SERVICES]) {
    const exists = await db.service.findUnique({ where: { slug: s.slug } });
    if (exists) continue;
    await db.service.create({
      data: {
        slug: s.slug, name: s.name, pillar: s.pillar, icon: s.icon, imageKey: s.imageKey, sortOrder: s.sortOrder, acceptsItems: s.acceptsItems, department: SERVICE_ROUTING[s.slug]?.department ?? 'sales', audience: SERVICE_ROUTING[s.slug]?.audience ?? 'buy',
        summary: s.summary, description: s.description, highlights: s.highlights, instructions: s.instructions, needsReview: true,
        fields: {
          create: s.fields.map((f, i) => ({
            key: f.key, label: f.label, type: f.type, required: !!f.required, options: f.options ?? undefined, unit: f.unit ?? null,
            helpText: f.helpText ?? null, placeholder: f.placeholder ?? null, section: f.section ?? 'Requirement', sortOrder: i * 10,
          })),
        },
      },
    });
  }
  for (const d of DIVISIONS) {
    if (await db.division.findUnique({ where: { slug: d.slug } })) continue;
    await db.division.create({ data: { ...d, needsReview: true } });
  }
  for (const [i, c] of JOURNAL_CATEGORIES.entries()) {
    if (await db.articleCategory.findUnique({ where: { slug: c.slug } })) continue;
    await db.articleCategory.create({ data: { ...c, sortOrder: i } });
  }
  if ((await db.faq.count()) === 0) {
    await db.faq.createMany({ data: FAQS.map((f, i) => ({ ...f, sortOrder: i })) });
  }
  const settings: Record<string, unknown> = { company: DEFAULTS.company, quotes: DEFAULTS.quotes, notifications: DEFAULTS.notifications, security: { requireStaffMfa: process.env.NODE_ENV === 'production' }, facts: FACTS, departments: DEFAULTS.departments, executive: DEFAULTS.executive, seo: DEFAULTS.seo };
  for (const [key, value] of Object.entries(settings)) {
    await db.siteSetting.upsert({ where: { key }, create: { key, value: value as any }, update: {} });
  }

  // First Super Admin. In production supply SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (or use `npm run admin:create`).
  const email = (process.env.SEED_ADMIN_EMAIL ?? '').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? '';
  const prod = process.env.NODE_ENV === 'production';
  if (email && password) {
    await upsertUser(email, 'Super Admin', 'SUPER_ADMIN', password);
    console.log(`Super Admin ready: ${email}`);
  } else if (!prod) {
    await upsertUser('admin@stchris.local', 'Dev Super Admin', 'SUPER_ADMIN', 'DevPassword-123');
    console.log('Development admin: admin@stchris.local / DevPassword-123  (not created in production)');
  } else {
    console.log('No admin created. Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD, or run `npm run admin:create`.');
  }
  // The GeePee Tanks feature: a draft skeleton owned by the first Super Admin, blocked from publishing until its placeholders are replaced
  const owner = await db.user.findFirst({ where: { role: 'SUPER_ADMIN' }, orderBy: { createdAt: 'asc' } });
  const cat = await db.articleCategory.findUnique({ where: { slug: 'partnerships-collaborations' } });
  if (owner && cat && !(await db.article.findUnique({ where: { slug: GEEPEE_SLUG } }))) {
    await db.article.create({ data: { slug: GEEPEE_SLUG, kind: 'FEATURE', title: GEEPEE_TITLE, excerpt: '[[One-paragraph summary of the partnership, written once the story is confirmed.]]', body: GEEPEE_BODY, categoryId: cat.id, authorId: owner.id, featuredImageKey: 'tank-black-5', tags: ['partnership', 'geepee-tanks'], status: 'DRAFT' } });
  }
  if (!prod && process.env.SEED_DEMO_USERS === 'true') {
    const pw = 'DevPassword-123';
    await upsertUser('ops@stchris.local', 'Dev Operations Admin', 'OPS_ADMIN', pw);
    await upsertUser('staff@stchris.local', 'Dev Operations Staff', 'OPS_STAFF', pw);
    await upsertUser('commercial@stchris.local', 'Dev Commercial', 'COMMERCIAL', pw);
    await upsertUser('approver@stchris.local', 'Dev Approver', 'APPROVER', pw);
    await upsertUser('content@stchris.local', 'Dev Content Manager', 'CONTENT_MANAGER', pw);
    await upsertUser('comms@stchris.local', 'Dev Communications', 'COMMUNICATIONS', pw);
    await upsertUser('employee@stchris.local', 'Dev Staff Member', 'STAFF_MEMBER', pw);
    console.log('Development staff accounts created (password DevPassword-123).');
  }
  console.log('Seed complete.');
}

async function upsertUser(email: string, name: string, role: 'SUPER_ADMIN' | 'OPS_ADMIN' | 'OPS_STAFF' | 'COMMERCIAL' | 'APPROVER' | 'CONTENT_MANAGER' | 'COMMUNICATIONS' | 'STAFF_MEMBER', password: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  await db.user.upsert({
    where: { email },
    create: { email, name, role, passwordHash, emailVerifiedAt: new Date() },
    update: {},
  });
}

main().finally(() => db.$disconnect());
