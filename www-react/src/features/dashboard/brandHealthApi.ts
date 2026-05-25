import { api } from '@/lib/api';

export type BrandHealthRow = {
  brand: string;
  brand_name: string;
  score: number;
  okr_pct: number;
  ontime_pct: number;
  velocity_health: number;
  breakdown: {
    okr_weight: number;
    ontime_weight: number;
    velocity_weight: number;
  };
};

export async function fetchBrandHealth(): Promise<BrandHealthRow[]> {
  const res = await api.get<{ message: BrandHealthRow[] }>(
    '/api/method/vernon_tasks.task.api.exec_analytics.list_brand_health',
  );
  return res.data.message ?? [];
}

export const BRAND_HEALTH_KEY = ['brand-health'] as const;
