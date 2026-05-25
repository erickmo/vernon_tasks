/**
 * Brands API — Frappe REST CRUD (ADR-022).
 *
 * Uses `/api/resource/VT Brand` for all CRUD. Domain rules (FK guard on
 * delete, autoname rename on `brand_name` change) live in the doctype
 * controller so REST endpoints enforce them without a custom wrapper.
 *
 * The only remaining `/api/method` call is `get_brand_permissions`: Frappe
 * REST does not expose role-aware capability flags in a single round trip.
 */
import { api } from '@/lib/api';
import type { Brand, BrandFormValues, BrandOption, BrandPermissions } from './types';

const RESOURCE = '/api/resource/VT Brand';
const PERMISSIONS_METHOD =
  '/api/method/vernon_tasks.brand.api.portal_brands.get_brand_permissions';

const BRAND_FIELDS = JSON.stringify(['name', 'brand_name', 'logo', 'description']);
const BRAND_OPTION_FIELDS = JSON.stringify(['name', 'brand_name', 'logo']);
const LIST_PAGE_SIZE = 500;
const SEARCH_DEFAULT_LIMIT = 20;

export const BRAND_KEY = {
  list: (search: string) => ['brands', 'list', search] as const,
  detail: (id: string) => ['brand', id] as const,
  permissions: () => ['brands', 'permissions'] as const,
  search: (q: string) => ['brand-search', q] as const,
};

type FrappeBrandRow = {
  name: string;
  brand_name: string;
  logo: string | null;
  description?: string | null;
};

/** Map Frappe's primary key `name` onto our domain `id`. */
function toBrand(row: FrappeBrandRow): Brand {
  return {
    id: row.name,
    brand_name: row.brand_name,
    logo: row.logo,
    description: row.description ?? null,
  };
}

function toBrandOption(row: FrappeBrandRow): BrandOption {
  return { id: row.name, brand_name: row.brand_name, logo: row.logo };
}

export async function getBrandPermissions(): Promise<BrandPermissions> {
  const res = await api.get<{ message: BrandPermissions }>(PERMISSIONS_METHOD);
  return res.data.message;
}

export async function listBrands(search = ''): Promise<Brand[]> {
  const params: Record<string, string | number> = {
    fields: BRAND_FIELDS,
    order_by: 'brand_name asc',
    limit_page_length: LIST_PAGE_SIZE,
  };
  const q = search.trim();
  if (q) {
    // Frappe REST filter operator format: [[fieldname, op, value]]
    params.filters = JSON.stringify([['brand_name', 'like', `%${q}%`]]);
  }
  const res = await api.get<{ data: FrappeBrandRow[] }>(RESOURCE, { params });
  return res.data.data.map(toBrand);
}

export async function searchBrands(query = '', limit = SEARCH_DEFAULT_LIMIT): Promise<BrandOption[]> {
  const lim = Math.max(1, Math.min(limit, 50));
  const params: Record<string, string | number> = {
    fields: BRAND_OPTION_FIELDS,
    order_by: 'brand_name asc',
    limit_page_length: lim,
  };
  const q = query.trim();
  if (q) {
    params.filters = JSON.stringify([['brand_name', 'like', `%${q}%`]]);
  }
  const res = await api.get<{ data: FrappeBrandRow[] }>(RESOURCE, { params });
  return (res.data.data ?? []).map(toBrandOption);
}

export async function getBrand(id: string): Promise<Brand> {
  // Frappe REST single-doc shape: { data: {...full doc...} }
  const res = await api.get<{ data: FrappeBrandRow }>(`${RESOURCE}/${encodeURIComponent(id)}`);
  return toBrand(res.data.data);
}

export async function createBrand(payload: BrandFormValues): Promise<Brand> {
  const res = await api.post<{ data: FrappeBrandRow }>(RESOURCE, payload);
  return toBrand(res.data.data);
}

/**
 * Nama brand bersifat permanen (doctype `allow_rename: 0`, autoname
 * `field:brand_name`). Jika user mengubah `brand_name`, kita tolak di
 * frontend dengan pesan Bahasa Indonesia yang ramah — backend akan
 * melempar `ValidationError: VT Brand not allowed to be renamed` yang
 * tidak informatif untuk pengguna.
 */
export class BrandRenameNotAllowedError extends Error {
  constructor() {
    super(
      'Nama brand tidak bisa diubah. Untuk mengganti nama, hapus brand ini lalu buat brand baru (pastikan tidak ada proyek yang masih terhubung).',
    );
    this.name = 'BrandRenameNotAllowedError';
  }
}

export async function updateBrand(id: string, payload: Partial<BrandFormValues>): Promise<Brand> {
  const newName = payload.brand_name?.trim();
  if (newName && newName !== id) {
    throw new BrandRenameNotAllowedError();
  }
  const res = await api.put<{ data: FrappeBrandRow }>(
    `${RESOURCE}/${encodeURIComponent(id)}`,
    payload,
  );
  return toBrand(res.data.data);
}

export async function deleteBrand(id: string): Promise<void> {
  // Doctype `on_trash` raises ValidationError if any VT Project links here.
  await api.delete(`${RESOURCE}/${encodeURIComponent(id)}`);
}
