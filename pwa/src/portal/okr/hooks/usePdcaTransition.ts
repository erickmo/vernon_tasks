import { useMutation, useQueryClient } from "@tanstack/react-query";
import { bulkAdvancePdca } from "../api/bulk";
import { okrKeys } from "./keys";

export function usePdcaTransition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (names: string[]) => bulkAdvancePdca(names),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: okrKeys.lists() });
      for (const a of data.advanced) {
        qc.invalidateQueries({ queryKey: okrKeys.detail(a.name) });
      }
    },
  });
}
