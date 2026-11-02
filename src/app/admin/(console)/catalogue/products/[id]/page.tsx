import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/server/rbac';
import { PageHeader, Badge } from '@/components/ui';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { adminProduct, adminCategories, adminBrands } from '@/server/catalogue';
import { photoOptions } from '@/server/media';
import { saveProductAction, deleteProductAction, saveVariantAction, deleteVariantAction } from '../../actions';

export const metadata = { title: 'Edit product' };

const AVAIL = [{ value: 'ON_REQUEST', label: 'Confirmed on request' }, { value: 'IN_STOCK', label: 'In stock' }, { value: 'ON_ORDER', label: 'Sourced against the order' }, { value: 'DISCONTINUED', label: 'Discontinued' }];

export default async function ProductEdit({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff('catalogue.manage');
  const { id } = await params;
  const isNew = id === 'new';
  const [p, cats, brands, photos] = await Promise.all([isNew ? null : adminProduct(id), adminCategories(), adminBrands(), photoOptions()]);
  if (!isNew && !p) notFound();
  const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
  const specs = p && Array.isArray(p.specs) ? (p.specs as { label: string; value: string }[]).map((s) => `${s.label}: ${s.value}`).join('\n') : '';
  return (
    <>
      <p className="mb-3 text-sm"><Link href="/admin/catalogue">← Catalogue</Link></p>
      <PageHeader title={p?.name ?? 'New product'} eyebrow="Product" actions={p && p.status === 'PUBLISHED' ? <a href={`/products/${p.slug}`} target="_blank" rel="noopener" className="btn btn-outline">View on website</a> : undefined}>
        {p?.needsReview && <Badge tone="warn">Needs St. Chris review</Badge>}
      </PageHeader>
      <ActionForm action={saveProductAction} className="grid gap-4 max-w-3xl">
        {p && <input type="hidden" name="id" value={p.id} />}
        <Field name="name" label="Name" defaultValue={p?.name} required /><Field name="slug" label="Web address (slug)" defaultValue={p?.slug} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="categoryId" type="select" label="Category" defaultValue={p?.categoryId ?? ''} required options={[{ value: '', label: 'Choose…' }, ...cats.map((c) => ({ value: c.id, label: c.name }))]} />
          <Field name="brandId" type="select" label="Brand" defaultValue={p?.brandId ?? ''} options={[{ value: '', label: 'No brand' }, ...brands.map((b) => ({ value: b.id, label: `${b.name}${b.visible ? '' : ' (hidden)'}` }))]} />
        </div>
        <Field name="summary" label="One-line summary" defaultValue={p?.summary} required />
        <Field name="description" type="textarea" rows={6} label="Description (Markdown)" defaultValue={p?.description} />
        <Field name="highlights" type="textarea" rows={4} label="Highlights (one per line)" defaultValue={arr(p?.highlights).join('\n')} />
        <Field name="specs" type="textarea" rows={5} label="Specification (“Label: value”, one per line)" defaultValue={specs} />
        <div>
          <p className="label">Photographs</p>
          <p className="hint mb-2">First is the main image. Use one photo reference per line: a supplied key or an uploaded photo shown below.</p>
          <Field name="imageKeys" type="textarea" rows={3} label="Photo references" defaultValue={arr(p?.imageKeys).join('\n')} hint={<>Available: {photos.filter((o) => o.value).map((o) => <code key={o.value} className="mono text-xs mr-2">{o.value}</code>)}</>} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field name="status" type="select" label="Status" defaultValue={p?.status ?? 'DRAFT'} options={[{ value: 'DRAFT', label: 'Draft (not on the website)' }, { value: 'PUBLISHED', label: 'Published' }]} />
          <Field name="sortOrder" type="number" label="Order" defaultValue={p?.sortOrder ?? 0} />
          <Field name="featured" type="checkbox" label="Feature on the home page" defaultValue={p?.featured} className="self-end pb-2" />
        </div>
        <SubmitButton>{p ? 'Save product' : 'Create product'}</SubmitButton>
      </ActionForm>

      {p && (
        <>
          <section className="mt-12" aria-labelledby="var-h">
            <h2 id="var-h" className="!text-lg mb-1">Sizes and options ({p.variants.length})</h2>
            <p className="text-sm text-steel mb-4 max-w-2xl">Sizes are optional. Price is your internal price book value: it pre-fills quotation lines and is never shown publicly. SKUs are yours to assign.</p>
            <div className="space-y-3">
              {p.variants.map((v) => (
                <details key={v.id} className="panel"><summary className="cursor-pointer px-4 py-3 flex flex-wrap gap-3 items-center"><span className="font-medium">{v.label}</span><span className="mono text-xs text-steel">{v.sku ?? 'no SKU'}</span>{v.price && <span className="mono text-xs">₦{Number(v.price).toLocaleString('en-NG')}</span>}{!v.visible && <Badge>Hidden</Badge>}</summary>
                  <div className="p-4 border-t border-line"><VariantForm productId={p.id} v={v} />
                    <ActionForm action={deleteVariantAction} className="mt-3"><input type="hidden" name="variantId" value={v.id} /><SubmitButton className="btn btn-danger btn-sm">Delete size</SubmitButton></ActionForm></div></details>
              ))}
            </div>
            <details className="panel panel-pad mt-4"><summary className="cursor-pointer font-display font-bold">Add a size or option</summary><div className="mt-4"><VariantForm productId={p.id} /></div></details>
          </section>
          <ActionForm action={deleteProductAction} className="mt-12"><input type="hidden" name="id" value={p.id} /><SubmitButton className="btn btn-danger btn-sm" pending="Deleting…">Delete product</SubmitButton><p className="hint mt-2">Past requests and quotations keep their own copy of what was asked, so deleting a product never changes them.</p></ActionForm>
        </>
      )}
    </>
  );
}

function VariantForm({ productId, v }: { productId: string; v?: { id: string; label: string; sku: string | null; unit: string; price: { toString(): string } | null; availability: string; minQuantity: { toString(): string } | null; sortOrder: number; visible: boolean } }) {
  return (
    <ActionForm action={saveVariantAction} resetOnSuccess={!v} className="grid gap-3 sm:grid-cols-2 max-w-3xl">
      <input type="hidden" name="productId" value={productId} />{v && <input type="hidden" name="variantId" value={v.id} />}
      <Field name="label" label="Size or option" defaultValue={v?.label} required placeholder="e.g. 5,000 litres, 600 × 600 mm" /><Field name="sku" label="SKU (optional)" defaultValue={v?.sku ?? ''} />
      <Field name="unit" label="Unit" defaultValue={v?.unit ?? 'each'} /><Field name="price" label="Price book value (₦, internal)" defaultValue={v?.price?.toString() ?? ''} inputMode="decimal" />
      <Field name="availability" type="select" label="Availability" defaultValue={v?.availability ?? 'ON_REQUEST'} options={AVAIL} /><Field name="minQuantity" label="Minimum quantity (optional)" defaultValue={v?.minQuantity?.toString() ?? ''} inputMode="decimal" />
      <Field name="sortOrder" type="number" label="Order" defaultValue={v?.sortOrder ?? 0} /><Field name="visible" type="checkbox" label="Visible" defaultValue={v?.visible ?? true} className="self-end pb-2" />
      <div className="sm:col-span-2"><SubmitButton className="btn btn-outline btn-sm">{v ? 'Save size' : 'Add size'}</SubmitButton></div>
    </ActionForm>
  );
}
