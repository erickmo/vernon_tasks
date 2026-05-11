import { useCallback, useEffect, useRef } from "react";

export interface UndoableMutationApi<TArgs> {
  trigger: (args: TArgs) => void;
  cancel: () => void;
}

export function useUndoableMutation<TArgs>(
  mutationFn: (args: TArgs) => Promise<unknown>,
  windowMs: number,
): UndoableMutationApi<TArgs> {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const trigger = useCallback(
    (args: TArgs) => {
      cancel();
      timer.current = setTimeout(() => {
        timer.current = null;
        mutationFn(args);
      }, windowMs);
    },
    [cancel, mutationFn, windowMs],
  );

  useEffect(() => cancel, [cancel]);

  return { trigger, cancel };
}
