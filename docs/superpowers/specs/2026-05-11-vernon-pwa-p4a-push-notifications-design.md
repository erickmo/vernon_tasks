# Vernon Tasks PWA — P4a Push Notifications

**Date:** 2026-05-11
**Predecessors:** PRs #1–#8 (P0.5 through P3b + cleanup + docs)

## Goals

- Users can subscribe to push notifications from the PWA
- New `Notification Log` entries trigger push delivery to all of that
  user's subscribed browsers
- VAPID keys stored in `VT Settings`, generated once via CLI helper
- iOS support: works on iOS 16.4+ Safari when PWA installed via A2HS,
  with clear UI hint about that requirement
- New telemetry events: `push_subscribe_attempt`, `push_subscribed`,
  `push_unsubscribed`, `push_received`

Non-goals (deferred to P4b):

- Per-event-type subscription preferences
- Quiet hours / mute settings
- Notification action buttons (reply / snooze inline)
- Sound preferences
- Badge count sync (separate W3C Badging API)

## Phase placement

| Phase | Scope | Status |
|-------|-------|--------|
| **P4a** | **Push infra + Notification Log trigger (this spec)** | In progress |
| P4b | Per-event prefs + actions + badging | Future |

## Architecture

### Backend additions

```
vernon_tasks/
  vt_settings/doctype/vt_settings/vt_settings.json
                                        # MODIFY: add 2 push fields
  vt_settings/doctype/vernon_push_subscription/
    __init__.py
    vernon_push_subscription.json
    vernon_push_subscription.py
    test_vernon_push_subscription.py
  task/api/
    push.py                             # NEW: get_public_key, subscribe, unsubscribe, is_subscribed
    test_push.py
    telemetry.py                        # MODIFY: 4 new events
    boot.py                             # MODIFY: expose push_public_key
  task/services/
    push_sender.py                      # NEW: send_to_user, send_push_for_notification
    test_push_sender.py
  commands/
    __init__.py
    push_keys.py                        # bench command: vernon-generate-vapid
  hooks.py                              # MODIFY: doc_events on Notification Log
                                        # MODIFY: commands tuple
```

### VT Settings new fields

```
push_section: Section Break ("Push Notifications")
push_vapid_public_key: Data
push_vapid_private_key: Password
```

Both hidden from non-System Manager via existing perm structure.

### Vernon Push Subscription DocType

```json
{
  "doctype": "DocType",
  "name": "Vernon Push Subscription",
  "module": "VT Settings",
  "autoname": "hash",
  "field_order": ["user", "endpoint", "p256dh", "auth", "user_agent", "last_seen"],
  "fields": [
    {"fieldname": "user", "fieldtype": "Link", "options": "User", "reqd": 1, "in_list_view": 1, "in_standard_filter": 1},
    {"fieldname": "endpoint", "fieldtype": "Long Text", "reqd": 1, "unique": 1},
    {"fieldname": "p256dh", "fieldtype": "Data", "reqd": 1},
    {"fieldname": "auth", "fieldtype": "Data", "reqd": 1},
    {"fieldname": "user_agent", "fieldtype": "Data"},
    {"fieldname": "last_seen", "fieldtype": "Datetime", "default": "now"}
  ],
  "permissions": [
    {"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1}
  ],
  "track_changes": 0,
  "hide_toolbar": 1
}
```

Note: `endpoint` field gets a unique index. Frappe stores Long Text as
MEDIUMTEXT — index uses prefix automatically (~255 chars). Endpoints
are typically ~200 chars so collision risk low.

### push.py — whitelisted API

```python
import frappe
from frappe.utils import now_datetime


@frappe.whitelist(allow_guest=True)
def get_public_key() -> dict:
    key = frappe.db.get_single_value("VT Settings", "push_vapid_public_key") or ""
    return {"public_key": key}


@frappe.whitelist()
def subscribe(endpoint: str, p256dh: str, auth: str, user_agent: str = "") -> dict:
    user = frappe.session.user
    if user == "Guest":
        frappe.throw("Login required", frappe.PermissionError)

    existing = frappe.db.get_value("Vernon Push Subscription", {"endpoint": endpoint}, "name")
    if existing:
        frappe.db.set_value("Vernon Push Subscription", existing, {
            "user": user,
            "p256dh": p256dh,
            "auth": auth,
            "user_agent": user_agent,
            "last_seen": now_datetime(),
        })
        return {"ok": True, "renewed": True}

    frappe.get_doc({
        "doctype": "Vernon Push Subscription",
        "user": user,
        "endpoint": endpoint,
        "p256dh": p256dh,
        "auth": auth,
        "user_agent": user_agent,
        "last_seen": now_datetime(),
    }).insert(ignore_permissions=True)
    return {"ok": True, "renewed": False}


@frappe.whitelist()
def unsubscribe(endpoint: str) -> dict:
    user = frappe.session.user
    name = frappe.db.get_value(
        "Vernon Push Subscription",
        {"endpoint": endpoint, "user": user},
        "name",
    )
    if name:
        frappe.delete_doc("Vernon Push Subscription", name, ignore_permissions=True)
    return {"ok": True}


@frappe.whitelist()
def is_subscribed(endpoint: str) -> dict:
    user = frappe.session.user
    if user == "Guest":
        return {"subscribed": False}
    return {
        "subscribed": bool(
            frappe.db.exists(
                "Vernon Push Subscription",
                {"endpoint": endpoint, "user": user},
            )
        ),
    }
```

### push_sender.py — send service

```python
import json
import frappe
from pywebpush import webpush, WebPushException


def _vapid() -> tuple[str, str, str]:
    pub = frappe.db.get_single_value("VT Settings", "push_vapid_public_key") or ""
    priv = frappe.db.get_single_value("VT Settings", "push_vapid_private_key") or ""
    subject = "mailto:" + (frappe.db.get_single_value("System Settings", "email_footer_address") or "vernon@localhost")
    return pub, priv, subject


def send_to_user(user: str, payload: dict) -> int:
    """Send push to every subscription for a user. Returns count delivered."""
    if user == "Guest":
        return 0
    _pub, priv, subject = _vapid()
    if not priv:
        return 0

    subs = frappe.get_all(
        "Vernon Push Subscription",
        filters={"user": user},
        fields=["name", "endpoint", "p256dh", "auth"],
    )
    sent = 0
    for s in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": s["endpoint"],
                    "keys": {"p256dh": s["p256dh"], "auth": s["auth"]},
                },
                data=json.dumps(payload),
                vapid_private_key=priv,
                vapid_claims={"sub": subject},
                ttl=86400,
            )
            sent += 1
        except WebPushException as e:
            # 404 / 410: endpoint dead, prune
            if e.response is not None and e.response.status_code in (404, 410):
                frappe.delete_doc(
                    "Vernon Push Subscription",
                    s["name"],
                    ignore_permissions=True,
                )
            else:
                frappe.log_error(
                    f"push_sender to {user}: {e}",
                    "Vernon Push",
                )
    return sent


def send_push_for_notification(doc, method=None):
    """Hook target: dispatched on Notification Log insert."""
    if not doc.for_user or doc.for_user == "Administrator":
        return
    payload = {
        "title": "Vernon Tasks",
        "body": doc.subject or "Notifikasi baru",
        "url": _target_url(doc),
        "tag": doc.name,
    }
    send_to_user(doc.for_user, payload)


def _target_url(doc) -> str:
    if doc.document_type == "VT Task" and doc.document_name:
        return f"/m/work/{doc.document_name}"
    return "/m/me/notifications"
```

### hooks.py additions

```python
doc_events = {
    # existing entries kept …
    "Notification Log": {
        "after_insert": "vernon_tasks.task.services.push_sender.send_push_for_notification",
    },
}

commands = [
    "vernon_tasks.commands.push_keys.vernon_generate_vapid",
]
```

### CLI command

```python
# vernon_tasks/commands/push_keys.py
import click
import frappe
from frappe.commands import pass_context, get_site
from py_vapid import Vapid


@click.command("vernon-generate-vapid")
@click.option("--force", is_flag=True, help="Overwrite existing keys")
@pass_context
def vernon_generate_vapid(context, force):
    """Generate VAPID keys and store in VT Settings."""
    site = get_site(context)
    frappe.init(site=site)
    frappe.connect()
    try:
        existing = frappe.db.get_single_value("VT Settings", "push_vapid_public_key")
        if existing and not force:
            click.echo(f"Public key already set. Use --force to overwrite.")
            return

        v = Vapid()
        v.generate_keys()
        pub_b64 = v.public_key_b64urlsafe().decode()
        priv_pem = v.private_pem().decode()

        frappe.db.set_single_value("VT Settings", "push_vapid_public_key", pub_b64)
        frappe.db.set_single_value("VT Settings", "push_vapid_private_key", priv_pem)
        frappe.db.commit()
        click.echo(f"VAPID keys generated. Public:\n{pub_b64}")
    finally:
        frappe.destroy()
```

> Note: `pywebpush` ships `py_vapid`. Both come from a single `pip
> install pywebpush` (dependency chain).

### boot.py — expose public key

Extend `boot()` to include `push_public_key` so PWA can `applicationServerKey` it without an extra round-trip:

```python
@frappe.whitelist(allow_guest=True)
def boot():
    user = frappe.session.user
    pub_key = frappe.db.get_single_value("VT Settings", "push_vapid_public_key") or ""
    if user == "Guest":
        return {"user": None, "csrf_token": None, "roles": [], "push_public_key": pub_key}
    return {
        "user": user,
        "csrf_token": frappe.sessions.get_csrf_token(),
        "roles": frappe.get_roles(user),
        "push_public_key": pub_key,
    }
```

Backward compatible (additive field).

### Frontend: push.ts API client

```typescript
import { api } from "./client";

const BASE = "/api/method/vernon_tasks.task.api.push";

export const getPublicKey = () =>
  api.get<{ public_key: string }>(`${BASE}.get_public_key`);

export const subscribePush = (endpoint: string, p256dh: string, auth: string, user_agent: string) =>
  api.post<{ ok: boolean; renewed: boolean }>(`${BASE}.subscribe`, {
    endpoint, p256dh, auth, user_agent,
  });

export const unsubscribePush = (endpoint: string) =>
  api.post<{ ok: boolean }>(`${BASE}.unsubscribe`, { endpoint });
```

### Frontend: usePush hook

```typescript
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
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    navigator.serviceWorker.ready.then(async (r) => {
      setReg(r);
      const sub = await r.pushManager.getSubscription();
      if (Notification.permission === "denied") setState("denied");
      else setState(sub ? "on" : "off");
    });
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
      applicationServerKey: urlBase64ToUint8Array(public_key),
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
```

### Frontend: PushToggle component

```typescript
import { usePush } from "../hooks/usePush";
import { logEvent } from "../telemetry";
import { useToast } from "./Toast";
import { t } from "../i18n";

function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}
function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches;
}

export function PushToggle() {
  const { state, turnOn, turnOff } = usePush();
  const { show } = useToast();

  if (state === "unsupported") {
    return <p style={{ color: "var(--vt-text-muted)", fontSize: 13 }}>{t("push.unsupported")}</p>;
  }

  async function onToggle(target: "on" | "off") {
    logEvent("push_subscribe_attempt", { target });
    try {
      if (target === "on") {
        await turnOn();
        logEvent("push_subscribed", {});
      } else {
        await turnOff();
        logEvent("push_unsubscribed", {});
      }
    } catch (e) {
      show(t("push.failed"));
    }
  }

  const iosHint = isIOS() && !isStandalone();

  return (
    <div style={{ padding: "var(--vt-space-4)", background: "var(--vt-surface)", borderRadius: "var(--vt-radius)", marginTop: "var(--vt-space-3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 600 }}>{t("push.title")}</div>
          <div style={{ fontSize: 13, color: "var(--vt-text-muted)", marginTop: 4 }}>
            {state === "on" ? t("push.status_on") :
             state === "denied" ? t("push.status_denied") :
             t("push.status_off")}
          </div>
        </div>
        {state !== "denied" && (
          <button
            onClick={() => onToggle(state === "on" ? "off" : "on")}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              border: 0,
              background: state === "on" ? "var(--vt-text-muted)" : "var(--vt-primary)",
              color: "white",
              fontWeight: 600,
            }}
          >
            {state === "on" ? t("push.turn_off") : t("push.turn_on")}
          </button>
        )}
      </div>
      {iosHint && (
        <p style={{ marginTop: 12, fontSize: 12, color: "var(--vt-warn)" }}>
          {t("push.ios_hint")}
        </p>
      )}
    </div>
  );
}
```

### Service worker push handler

Switch vite-plugin-pwa from `generateSW` to `injectManifest` to own the
SW source. New `pwa/src/sw.ts`:

```typescript
/// <reference lib="webworker" />
import { precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { StaleWhileRevalidate } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  ({ url }) => url.pathname.startsWith("/api/method/vernon_tasks."),
  new StaleWhileRevalidate({
    cacheName: `vt-api-${__SW_VERSION__}`,
    plugins: [
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 }),
    ],
  }),
);

self.addEventListener("push", (event: PushEvent) => {
  const data = event.data?.json() ?? {};
  const title = data.title ?? "Vernon Tasks";
  const options: NotificationOptions = {
    body: data.body ?? "",
    tag: data.tag,
    data: { url: data.url ?? "/m/me/notifications" },
    icon: "/m/icons/icon-192.png",
    badge: "/m/icons/icon-192.png",
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url ?? "/m/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((c) => c.url.includes(url));
        if (existing) return (existing as WindowClient).focus();
        return self.clients.openWindow(url);
      }),
  );
});

declare const __SW_VERSION__: string;
```

### vite.config.ts changes

Switch to `injectManifest`:

```typescript
VitePWA({
  strategies: "injectManifest",
  srcDir: "src",
  filename: "sw.ts",
  injectManifest: { swSrc: "src/sw.ts", swDest: "sw.js" },
  manifest: { /* unchanged */ },
})
```

### Telemetry events

Backend `ALLOWED_EVENTS` and frontend `TelemetryEvent` type both
get:

```
"push_subscribe_attempt",
"push_subscribed",
"push_unsubscribed",
"push_received",
```

`push_received` is logged by SW via `fetch` to the telemetry endpoint
(fire-and-forget, no await).

### Permissions

- `push.get_public_key` allow_guest (read-only metadata)
- `push.subscribe` / `unsubscribe` / `is_subscribed`: authenticated
- `Vernon Push Subscription` DocType: System Manager only
- VAPID private key: never exposed to frontend (only public key in boot)

### Error handling

| Failure | UX |
|---|---|
| Browser unsupported | UI shows "Browser tidak mendukung" |
| User denied permission | UI shows "Diblokir browser. Atur dari Settings." |
| Server VAPID key empty | turnOn throws; toast "Server belum siap" |
| push_sender 404/410 | Subscription auto-pruned |
| push_sender other error | Logged to `Error Log` (frappe.log_error) |
| Push delivered but PWA closed | Native OS notification appears; tap opens URL |

### Testing

#### Vitest

- `push.test.ts` — subscribe/unsubscribe URL + body
- `usePush.test.ts` — state machine when PushManager unavailable, when
  permission denied (mock `Notification.permission`)
- `PushToggle.test.tsx` — renders correct status text per state

#### pytest

- `test_vernon_push_subscription.py` — DocType create + unique endpoint
- `test_push.py` — subscribe idempotency (renewed: true), unsubscribe
  ownership check
- `test_push_sender.py` — send_to_user iterates subscriptions; 404
  prunes; payload contains expected fields (use unittest.mock for
  webpush)

### Bundle impact

- SW source switch + push handler: ~3 KB
- usePush hook + PushToggle: ~3 KB
- Main bundle estimate: 310 KB (from 304)

### Rollout

1. `pip install pywebpush` on server (add to `pyproject.toml`)
2. `bench --site <site> migrate` (registers new DocType + VT Settings fields)
3. `bench --site <site> vernon-generate-vapid` (writes keys)
4. `./pwa/build-pwa.sh && bench restart`
5. Pilot user opens `/m/me`, taps "Aktifkan push"
6. Trigger a Notification Log entry (assign a task) — push appears
7. Monitor `Vernon Telemetry Event` for `push_subscribed` /
   `push_received` rates

### Known limitations

- iOS only delivers push when PWA is installed via A2HS (iOS 16.4+).
  UI shows hint when iOS user without standalone tries to subscribe.
- Push works only when SW is registered (i.e., after first PWA load).
- macOS Safari currently does not support Web Push (Sequoia adds it).
- Firefox + Chrome desktop/Android: full support.

## Open questions

None.
