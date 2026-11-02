'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { runAction, str, bool, type FormState } from '@/server/action-utils';
import { actionStaff } from '@/server/rbac';
import { invalid } from '@/server/errors';
import { saveCategory, deleteCategory, saveProduct, deleteProduct, saveVariant, deleteVariant, saveBrand, deleteBrand, importCatalogueCsv } from '@/server/catalogue';

const refresh = () => { revalidatePath('/catalogue', 'layout'); revalidatePath('/products', 'layout'); revalidatePath('/', 'layout'); revalidatePath('/admin/catalogue', 'layout'); };

export async function saveCategoryAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const u = await actionStaff('catalogue.manage');
    const id = str(fd, 'id') || null;
    const c = await saveCategory(u, id, { name: str(fd, 'name'), slug: str(fd, 'slug'), summary: str(fd, 'summary'), description: str(fd, 'description'), range: str(fd, 'range'), groupLabel: str(fd, 'groupLabel') || 'Building & plumbing', sortOrder: str(fd, 'sortOrder') || 0, visible: bool(fd, 'visible'), imageKey: fd.has('imageKey') ? str(fd, 'imageKey') : undefined });
    refresh();
    if (!id) redirect(`/admin/catalogue/categories/${c.id}`);
    return 'Saved. The public catalogue shows this change immediately.';
  });
}

export async function deleteCategoryAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const u = await actionStaff('catalogue.manage');
    await deleteCategory(u, str(fd, 'id'));
    refresh();
    redirect('/admin/catalogue');
  });
}

export async function saveProductAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const u = await actionStaff('catalogue.manage');
    const id = str(fd, 'id') || null;
    const p = await saveProduct(u, id, { name: str(fd, 'name'), slug: str(fd, 'slug'), categoryId: str(fd, 'categoryId'), brandId: str(fd, 'brandId'), summary: str(fd, 'summary'), description: str(fd, 'description'), highlights: str(fd, 'highlights'), specs: str(fd, 'specs'), imageKeys: str(fd, 'imageKeys'), status: str(fd, 'status') || 'DRAFT', featured: bool(fd, 'featured'), sortOrder: str(fd, 'sortOrder') || 0 });
    refresh();
    if (!id) redirect(`/admin/catalogue/products/${p.id}`);
    return p.status === 'PUBLISHED' ? 'Saved and published.' : 'Saved as a draft. It is not on the website.';
  });
}

export async function deleteProductAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const u = await actionStaff('catalogue.manage');
    await deleteProduct(u, str(fd, 'id'));
    refresh();
    redirect('/admin/catalogue');
  });
}

export async function saveVariantAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const u = await actionStaff('catalogue.manage');
    const productId = str(fd, 'productId');
    await saveVariant(u, productId, str(fd, 'variantId') || null, { label: str(fd, 'label'), sku: str(fd, 'sku'), unit: str(fd, 'unit') || 'each', price: str(fd, 'price'), availability: str(fd, 'availability') || 'ON_REQUEST', minQuantity: str(fd, 'minQuantity'), sortOrder: str(fd, 'sortOrder') || 0, visible: bool(fd, 'visible') });
    refresh();
    return 'Size saved.';
  });
}

export async function deleteVariantAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const u = await actionStaff('catalogue.manage');
    await deleteVariant(u, str(fd, 'variantId'));
    refresh();
    return 'Size removed.';
  });
}

export async function saveBrandAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const u = await actionStaff('catalogue.manage');
    await saveBrand(u, str(fd, 'id') || null, { name: str(fd, 'name'), website: str(fd, 'website'), note: str(fd, 'note'), visible: bool(fd, 'visible') });
    refresh();
    return 'Brand saved.';
  });
}

export async function deleteBrandAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const u = await actionStaff('catalogue.manage');
    await deleteBrand(u, str(fd, 'id'));
    refresh();
    return 'Brand removed.';
  });
}

export async function importCsvAction(_: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const u = await actionStaff('catalogue.manage');
    const f = fd.get('file');
    if (!(f instanceof File) || f.size === 0) throw invalid('Choose a CSV file.', { file: 'Required.' });
    if (f.size > 2 * 1024 * 1024) throw invalid('Keep the file under 2 MB.', { file: 'Too large.' });
    const r = await importCatalogueCsv(u, await f.text());
    refresh();
    const head = `Imported: ${r.created} new product(s), ${r.updated} updated.`;
    if (r.errors.length) throw invalid(`${head}\n${r.errors.join('\n')}`);
    return `${head} New products are drafts until you publish them.`;
  });
}
