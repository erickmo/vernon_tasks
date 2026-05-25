import { api } from '@/lib/api';

export type KeyResultNode = {
  name: string;
  metric: string;
  target_value: number;
  current_value: number;
  unit?: string;
  progress_percent: number;
  confidence?: number;
};

export type KpiDefinitionNode = {
  name: string;
  kpi_name: string;
  frequency: string;
  unit?: string;
};

export type ProjectNode = {
  name: string;
  title: string;
  status: string;
  pdca_phase: string;
  start_date?: string;
  end_date?: string;
  health_score: number;
  percent_done: number;
};

export type ObjectiveNode = {
  name: string;
  title: string;
  period: string;
  period_start?: string;
  period_end?: string;
  objective_owner: string;
  status: string;
  pdca_phase: string;
  description?: string;
  key_results: KeyResultNode[];
  kpi_definitions: KpiDefinitionNode[];
  projects: ProjectNode[];
};

export type BrandStrategyNode = {
  brand: string;
  brand_name: string;
  logo?: string;
  description?: string;
  objective_count: number;
  project_count: number;
  objectives: ObjectiveNode[];
  unlinked_projects: ProjectNode[];
};

export async function fetchBrandStrategyTree(
  brand?: string,
): Promise<BrandStrategyNode[]> {
  const res = await api.get<{ message: BrandStrategyNode[] }>(
    '/api/method/vernon_tasks.brand.api.brand_strategy.get_brand_strategy_tree',
    { params: brand ? { brand } : undefined },
  );
  return res.data.message ?? [];
}

export const STRATEGY_KEY = (brand?: string) =>
  ['brand-strategy', brand ?? 'all'] as const;
