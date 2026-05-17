import { api } from "../../../api/client";
import type { BulkAdvanceResult } from "./types";

export async function bulkAdvancePdca(names: string[]): Promise<BulkAdvanceResult> {
  return api.post<BulkAdvanceResult>(
    "/api/method/vernon_tasks.api.okr.bulk_advance_pdca",
    { names: JSON.stringify(names) },
  );
}
