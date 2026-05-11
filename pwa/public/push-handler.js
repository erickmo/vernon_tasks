// Static script imported by the generated SW via workbox.importScripts.
// Adds push + notificationclick listeners. No bundling — plain JS.

self.addEventListener("push", function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Vernon Tasks", body: event.data ? event.data.text() : "" };
  }
  var title = data.title || "Vernon Tasks";
  var options = {
    body: data.body || "",
    tag: data.tag,
    data: {
      url: data.url || "/m/me/notifications",
      task_id: data.task_id || null,
    },
    icon: "/m/icons/icon-192.png",
    badge: "/m/icons/icon-192.png",
    actions: Array.isArray(data.actions) ? data.actions : [],
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
  var data = event.notification.data || {};
  var action = event.action;

  if (action === "complete" && data.task_id) {
    event.waitUntil(
      fetch(
        "/api/method/vernon_tasks.task.api.push_action.complete_from_notification",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ task_id: data.task_id }),
        },
      )
        .then(function () {
          return fetch(
            "/api/method/vernon_tasks.task.api.telemetry.log_event",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "same-origin",
              body: JSON.stringify({
                event: "push_action_complete",
                props: { task_id: data.task_id },
              }),
            },
          );
        })
        .catch(function () {}),
    );
    return;
  }

  // action === "view" or default tap: open URL
  var url = data.url || "/m/";
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
