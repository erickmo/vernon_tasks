import { api } from "../../../api/client";
import type { BulkUpdatePayload, BulkUpdateResult } from "./types";

export async function bulkUpdateProjects(
  names: string[],
  payload: BulkUpdatePayload,
): Promise<BulkUpdateResult> {
  return api.post<BulkUpdateResult>(
    "/api/method/vernon_tasks.api.projects.bulk_update_projects",
    { names: JSON.stringify(names), payload: JSON.stringify(payload) },
  );
}
