import { api } from "../../../api/client";
import type { KeyResult } from "./types";

export async function updateKeyResult(
  name: string,
  values: Partial<KeyResult> & { _modified?: string },
) {
  return api.put<KeyResult>(
    `/api/resource/Key Result/${encodeURIComponent(name)}`,
    values,
  );
}

export async function createKeyResult(
  values: Partial<KeyResult> & { objective: string },
) {
  return api.post<KeyResult>("/api/resource/Key Result", values);
}

export async function deleteKeyResult(name: string) {
  return api.delete(`/api/resource/Key Result/${encodeURIComponent(name)}`);
}
