// Static script imported by the generated SW via workbox.importScripts.
// Adds push + notificationclick listeners. No bundling — plain JS.

self.addEventListener("push", function (event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Vernon Tasks", body: event.data ? event.data.text() : "" };
  }
  var title = data.title || "Vernon Tasks";
  var options = {
    body: data.body || "",
    tag: data.tag,
    data: { url: data.url || "/m/me/notifications" },
    icon: "/m/icons/icon-192.png",
    badge: "/m/icons/icon-192.png",
  };
  event.waitUntil(
    self.registration.showNotification(title, options).then(function () {
      fetch("/api/method/vernon_tasks.task.api.telemetry.log_event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ event: "push_received", props: {} }),
      }).catch(function () {});
    }),
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || "/m/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clients) {
        for (var i = 0; i < clients.length; i++) {
          if (clients[i].url.indexOf(url) >= 0) {
            return clients[i].focus();
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
