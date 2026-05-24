import { api } from '@/lib/api';
import type { Brand, BrandFormValues, BrandOption, BrandPermissions } from './types';

const BASE = '/api/method/vernon_tasks.brand.api.portal_brands';

export const BRAND_KEY = {
  list: (search: string) => ['brands', 'list', search] as const,
  detail: (id: string) => ['brand', id] as const,
  permissions: () => ['brands', 'permissions'] as const,
  search: (q: string) => ['brand-search', q] as const,
};

export async function getBrandPermissions(): Promise<BrandPermissions> {
  const res = await api.get<{ message: BrandPermissions }>(`${BASE}.get_brand_permissions`);
  return res.data.message;
}

export async function listBrands(search = ''): Promise<Brand[]> {
  const res = await api.get<{ message: Brand[] }>(`${BASE}.list_brands`, {
    params: { search },
  });
  return res.data.message;
}

export async function searchBrands(query = '', limit = 20): Promise<BrandOption[]> {
  const res = await api.get<{ message: BrandOption[] }>(`${BASE}.search_brands`, {
    params: { query, limit },
  });
  return res.data.message ?? [];
}

export async function getBrand(id: string): Promise<Brand> {
  const res = await api.get<{ message: Brand }>(`${BASE}.get_brand`, {
    params: { brand_id: id },
  });
  return res.data.message;
}

export async function createBrand(payload: BrandFormValues): Promise<Brand> {
  const res = await api.post<{ message: Brand }>(`${BASE}.create_brand`, {
    payload: JSON.stringify(payload),
  });
  return res.data.message;
}

export async function updateBrand(id: string, payload: Partial<BrandFormValues>): Promise<Brand> {
  const res = await api.post<{ message: Brand }>(`${BASE}.update_brand`, {
    brand_id: id,
    payload: JSON.stringify(payload),
  });
  return res.data.message;
}

export async function deleteBrand(id: string): Promise<void> {
  await api.post(`${BASE}.delete_brand`, { brand_id: id });
}
