import { get, set } from "idb-keyval";
const PREFIX = "vt:cache:";
export async function cacheGet(key) {
    return (await get(PREFIX + key));
}
export async function cachePut(key, value) {
    await set(PREFIX + key, value);
}
