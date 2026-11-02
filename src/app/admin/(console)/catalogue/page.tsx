import Link from 'next/link';
import { requireStaff } from '@/server/rbac';
import { PageHeader, Badge } from '@/components/ui';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { adminCategories, adminProducts, adminBrands, GROUP_ORDER } from '@/server/catalogue';
import { photoOptions } from '@/server/media';
import { saveCategoryAction, saveBrandAction, deleteBrandAction, importCsvAction } from './actions';

export const metadata = { title: 'Catalogue' };

export default async function CatalogueAdmin({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  await requireStaff('catalogue.manage');
  const sp = await searchParams;
  const [cats, products, brands, photos] = await Promise.all([adminCategories(), adminProducts({ categoryId: sp.category, q: sp.q?.trim() || undefined }), adminBrands(), photoOptions()]);
  return (
    <>
      <PageHeader title="Catalogue" eyebrow="Categories, products, sizes and prices" actions={<span className="flex gap-3"><a href="/admin/catalogue/export" className="btn btn-outline">Export CSV</a><Link href="/admin/catalogue/products/new" className="btn btn-primary">New product</Link></span>}>
        <p>What visitors can browse and add to a project list. Prices here are your internal price book: they pre-fill quotation lines and are never shown to the public.</p>
      </PageHeader>

      <section className="mb-10" aria-labelledby="cats-h">
        <h2 id="cats-h" className="!text-lg mb-3">Categories ({cats.length})</h2>
        <div className="table-wrap"><table className="dt"><caption className="sr-only">Categories</caption><thead><tr><th>Category</th><th>Group</th><th className="num">Products</th><th className="num">Range lines</th><th>Status</th></tr></thead>
          <tbody>{cats.map((c) => <tr key={c.id}><td><Link href={`/admin/catalogue/categories/${c.id}`} className="font-medium">{c.name}</Link></td><td>{c.groupLabel}</td><td className="num"><Link href={`/admin/catalogue?category=${c.id}`}>{c._count.products}</Link></td><td className="num">{Array.isArray(c.range) ? c.range.length : 0}</td>
            <td className="space-x-1">{c.visible ? <Badge tone="good">Visible</Badge> : <Badge>Hidden</Badge>}{c.needsReview && <Badge tone="warn">Needs review</Badge>}</td></tr>)}</tbody></table></div>
        <details className="panel panel-pad mt-4"><summary className="cursor-pointer font-display font-bold">Add a category</summary>
          <ActionForm action={saveCategoryAction} className="mt-4 grid gap-4 max-w-3xl">
            <Field name="name" label="Name" required /><Field name="groupLabel" type="select" label="Group" defaultValue={GROUP_ORDER[0]} options={GROUP_ORDER.map((g) => ({ value: g, label: g }))} />
            <Field name="summary" label="One-line summary" required /><Field name="range" type="textarea" rows={4} label="What we supply (one line each)" hint="Each line becomes a button visitors can add to their list." />
            <Field name="imageKey" type="select" label="Photo" options={photos} /><Field name="sortOrder" type="number" label="Order" defaultValue={cats.length + 1} /><Field name="visible" type="checkbox" label="Visible" defaultValue />
            <SubmitButton>Add category</SubmitButton>
          </ActionForm></details>
      </section>

      <section className="mb-10" aria-labelledby="prod-h">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <h2 id="prod-h" className="!text-lg">Products ({products.length}){sp.category ? ' in this category' : ''}</h2>
          <form className="flex gap-2" role="search"><label className="sr-only" htmlFor="aq">Search products or SKUs</label><input id="aq" name="q" defaultValue={sp.q ?? ''} className="input !min-h-[2.4rem]" placeholder="Search name or SKU" />{sp.category && <input type="hidden" name="category" value={sp.category} />}<button className="btn btn-outline btn-sm">Search</button></form>
        </div>
        <div className="table-wrap"><table className="dt"><caption className="sr-only">Products</caption><thead><tr><th>Product</th><th>Category</th><th>Brand</th><th className="num">Sizes</th><th>Status</th></tr></thead>
          <tbody>{products.length === 0 && <tr><td colSpan={5} className="text-steel">No products yet.</td></tr>}{products.map((p) => <tr key={p.id}><td><Link href={`/admin/catalogue/products/${p.id}`} className="font-medium">{p.name}</Link></td><td>{p.category.name}</td><td>{p.brand ? <>{p.brand.name}{!p.brand.visible && <span className="ml-1"><Badge>Hidden</Badge></span>}</> : '—'}</td><td className="num">{p.variants.length}</td>
            <td className="space-x-1">{p.status === 'PUBLISHED' ? <Badge tone="good">Published</Badge> : <Badge>Draft</Badge>}{p.featured && <Badge tone="info">Featured</Badge>}{p.needsReview && <Badge tone="warn">Needs review</Badge>}</td></tr>)}</tbody></table></div>
      </section>

      <section className="mb-10 grid gap-8 lg:grid-cols-2" aria-labelledby="imp-h">
        <div className="panel panel-pad">
          <h2 id="imp-h" className="!text-lg mb-2">Import from CSV</h2>
          <p className="text-sm text-steel mb-4">Columns: category, product, summary, brand, size, sku, unit, price, availability, status. Categories must already exist. Products match by name within a category and sizes by SKU; nothing is deleted. New products are drafts. <a href="/admin/catalogue/export">Export the current catalogue</a> to see the format.</p>
          <ActionForm action={importCsvAction} resetOnSuccess className="space-y-3" encType="multipart/form-data"><Field name="file" type="file" label="CSV file" accept=".csv,text/csv" required /><SubmitButton pending="Importing…">Import</SubmitButton></ActionForm>
        </div>
        <div className="panel panel-pad">
          <h2 className="!text-lg mb-2">Brands ({brands.length})</h2>
          <p className="text-sm text-steel mb-3">A brand shows on a product only while it is visible. Confirm St. Chris may show a brand before making it visible.</p>
          <ul className="divide-y divide-line mb-4">{brands.map((b) => (
            <li key={b.id} className="py-3"><details><summary className="cursor-pointer font-medium">{b.name} <span className="text-steel font-normal text-sm">· {b._count.products} product(s)</span> {!b.visible && <Badge>Hidden</Badge>}</summary>
              <ActionForm action={saveBrandAction} className="mt-3 space-y-3"><input type="hidden" name="id" value={b.id} /><Field name="name" label="Name" defaultValue={b.name} required /><Field name="website" label="Website (https://)" defaultValue={b.website ?? ''} /><Field name="note" type="textarea" rows={2} label="Internal note" defaultValue={b.note} /><Field name="visible" type="checkbox" label="Show on the website" defaultValue={b.visible} /><SubmitButton className="btn btn-outline btn-sm">Save</SubmitButton></ActionForm>
              <ActionForm action={deleteBrandAction} className="mt-2"><input type="hidden" name="id" value={b.id} /><SubmitButton className="btn btn-danger btn-sm">Delete</SubmitButton></ActionForm></details></li>
          ))}</ul>
          <details><summary className="cursor-pointer font-display font-bold">Add a brand</summary><ActionForm action={saveBrandAction} resetOnSuccess className="mt-3 space-y-3"><Field name="name" label="Name" required /><Field name="website" label="Website (https://)" /><Field name="note" type="textarea" rows={2} label="Internal note" /><Field name="visible" type="checkbox" label="Show on the website" /><SubmitButton>Add brand</SubmitButton></ActionForm></details>
        </div>
      </section>
    </>
  );
}
