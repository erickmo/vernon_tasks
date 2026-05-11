import { useCallback, useState } from "react";

const KEY = "vt_complete_count";
const READY_AT = 2;

function read(): number {
  const v = localStorage.getItem(KEY);
  return v ? Number(v) : 0;
}

export function useCompleteCounter() {
  const [count, setCount] = useState<number>(() => read());

  const increment = useCallback(() => {
    const next = read() + 1;
    localStorage.setItem(KEY, String(next));
    setCount(next);
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(KEY);
    setCount(0);
  }, []);

  return { count, ready: count >= READY_AT, increment, reset };
}
