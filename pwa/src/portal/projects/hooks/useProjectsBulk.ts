import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as bulkApi from "../api/bulk";
import type { BulkUpdatePayload } from "../api/types";
import { projectKeys } from "./keys";

export function useProjectsBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { names: string[]; payload: BulkUpdatePayload }) =>
      bulkApi.bulkUpdateProjects(args.names, args.payload),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: projectKeys.lists() });
      for (const u of data.updated) {
        qc.invalidateQueries({ queryKey: projectKeys.detail(u.name) });
      }
    },
  });
}
