import { api } from '@/lib/api';

const OBJECTIVE = '/api/resource/Objective';
const KEY_RESULT = '/api/resource/Key Result';
const KPI_DEFINITION = '/api/resource/KPI Definition';

export type ObjectiveFormValues = {
  title: string;
  brand: string;
  period: string;
  period_start?: string;
  period_end?: string;
  objective_owner: string;
  status?: string;
  pdca_phase?: string;
  description?: string;
};

export type KeyResultFormValues = {
  objective: string;
  metric: string;
  target_value: number;
  current_value?: number;
  unit?: string;
  confidence?: number;
};

export type KpiDefinitionFormValues = {
  kpi_name: string;
  brand: string;
  frequency: 'Daily' | 'Weekly' | 'Monthly';
  unit?: string;
  objective?: string;
  formula?: string;
};

export async function createObjective(p: ObjectiveFormValues) {
  const res = await api.post<{ data: { name: string } }>(OBJECTIVE, p);
  return res.data.data;
}

export async function updateObjective(id: string, p: Partial<ObjectiveFormValues>) {
  const res = await api.put<{ data: { name: string } }>(
    `${OBJECTIVE}/${encodeURIComponent(id)}`,
    p,
  );
  return res.data.data;
}

export async function deleteObjective(id: string) {
  await api.delete(`${OBJECTIVE}/${encodeURIComponent(id)}`);
}

export async function createKeyResult(p: KeyResultFormValues) {
  const res = await api.post<{ data: { name: string } }>(KEY_RESULT, p);
  return res.data.data;
}

export async function updateKeyResult(id: string, p: Partial<KeyResultFormValues>) {
  const res = await api.put<{ data: { name: string } }>(
    `${KEY_RESULT}/${encodeURIComponent(id)}`,
    p,
  );
  return res.data.data;
}

export async function deleteKeyResult(id: string) {
  await api.delete(`${KEY_RESULT}/${encodeURIComponent(id)}`);
}

export async function createKpiDefinition(p: KpiDefinitionFormValues) {
  const res = await api.post<{ data: { name: string } }>(KPI_DEFINITION, p);
  return res.data.data;
}

export async function updateKpiDefinition(id: string, p: Partial<KpiDefinitionFormValues>) {
  const res = await api.put<{ data: { name: string } }>(
    `${KPI_DEFINITION}/${encodeURIComponent(id)}`,
    p,
  );
  return res.data.data;
}

export async function deleteKpiDefinition(id: string) {
  await api.delete(`${KPI_DEFINITION}/${encodeURIComponent(id)}`);
}
