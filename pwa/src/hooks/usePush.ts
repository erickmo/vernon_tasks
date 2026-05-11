import { useEffect, useState } from "react";
import { getPublicKey, subscribePush, unsubscribePush } from "../api/push";

function urlBase64ToUint8Array(b64: string): Uint8Array {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushState = "unsupported" | "loading" | "denied" | "off" | "on";

export function usePush() {
  const [state, setState] = useState<PushState>("loading");
  const [reg, setReg] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      setState("unsupported");
      return;
    }
    navigator.serviceWorker.ready
      .then(async (r) => {
        setReg(r);
        const sub = await r.pushManager.getSubscription();
        if (Notification.permission === "denied") setState("denied");
        else setState(sub ? "on" : "off");
      })
      .catch(() => setState("unsupported"));
  }, []);

  async function turnOn() {
    if (!reg) return;
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      setState(perm === "denied" ? "denied" : "off");
      return;
    }
    const { public_key } = await getPublicKey();
    if (!public_key) {
      setState("off");
      throw new Error("Server VAPID key missing");
    }
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(public_key) as BufferSource,
    });
    const json = sub.toJSON();
    await subscribePush(
      sub.endpoint,
      json.keys?.p256dh ?? "",
      json.keys?.auth ?? "",
      navigator.userAgent,
    );
    setState("on");
  }

  async function turnOff() {
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await unsubscribePush(sub.endpoint);
      await sub.unsubscribe();
    }
    setState("off");
  }

  return { state, turnOn, turnOff };
}
