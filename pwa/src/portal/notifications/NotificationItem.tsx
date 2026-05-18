import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import type { PortalNotification } from "./api/portalNotifications";

interface Props {
  notification: PortalNotification;
  onRead: (name: string) => void;
}

function EventIcon({ eventType }: { eventType: PortalNotification["event_type"] }) {
  const icons: Record<PortalNotification["event_type"], string> = {
    task_assigned: "📋",
    task_review: "✅",
    sprint_status: "⚡",
    comment: "💬",
  };
  return (
    <span
      className="notif-item__icon"
      data-icon={eventType}
      aria-hidden="true"
    >
      {icons[eventType]}
    </span>
  );
}

const TASK_EVENTS: ReadonlySet<PortalNotification["event_type"]> = new Set([
  "task_assigned",
  "task_review",
  "comment",
]);

export function NotificationItem({ notification, onRead }: Props) {
  const navigate = useNavigate();
  const { name, event_type, message, is_read, creation, reference_name } = notification;
  const isUnread = is_read === 0;

  const creationDate = new Date(creation.replace(" ", "T"));
  const relativeTime = formatDistanceToNow(creationDate, { addSuffix: true });

  function handleClick() {
    onRead(name);
    if (TASK_EVENTS.has(event_type)) {
      navigate(`/portal/projects?task=${reference_name}`);
    } else {
      navigate("/portal/projects");
    }
  }

  return (
    <button
      type="button"
      className="notif-item"
      data-unread={String(isUnread)}
      onClick={handleClick}
      aria-label={message}
    >
      <div className="notif-item__icon-wrap">
        <EventIcon eventType={event_type} />
      </div>
      <div className="notif-item__body">
        <p className="notif-item__message">{message}</p>
        <time
          className="notif-item__time"
          dateTime={creationDate.toISOString()}
        >
          {relativeTime}
        </time>
      </div>
    </button>
  );
}
