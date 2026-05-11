import { get, set } from "idb-keyval";

const PREFIX = "vt:cache:";

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  return (await get(PREFIX + key)) as T | undefined;
}

export async function cachePut<T>(key: string, value: T): Promise<void> {
  await set(PREFIX + key, value);
}
