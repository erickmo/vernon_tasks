import DOMPurify from "dompurify";
import type { ActivityEntry, CommentEntry } from "./api/types";

const FIELD_LABELS: Record<string, string> = {
  kanban_status: "Status",
  pdca_phase: "PDCA",
  priority: "Prioritas",
  assigned_to: "Ditugaskan",
  deadline: "Deadline",
  estimated_hours: "Estimasi Jam",
};

function relativeTime(creation: string): string {
  const diff = Date.now() - new Date(creation).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return new Date(creation).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

interface Props {
  entries: ActivityEntry[];
  currentUser: string;
  role: "Manager" | "Leader" | "Member" | null;
  onDeleteComment: (name: string) => Promise<void>;
}

export function ActivityLog({ entries, currentUser, role, onDeleteComment }: Props) {
  return (
    <div className="activity-log">
      {entries.map((entry) => {
        if (entry.type === "version") {
          return (
            <div key={entry.name} className="activity-log__version">
              <span className="activity-log__meta">{entry.owner} · {relativeTime(entry.creation)}</span>
              {entry.changes.map(([field, oldVal, newVal], i) => (
                <div key={i} className="activity-log__diff">
                  <strong>{FIELD_LABELS[field] ?? field}:</strong> {oldVal ?? "—"} → {newVal ?? "—"}
                </div>
              ))}
            </div>
          );
        }

        const comment = entry as CommentEntry;
        const canDelete = role === "Manager" || role === "Leader" || comment.owner === currentUser;
        const sanitized = DOMPurify.sanitize(comment.content);

        return (
          <div key={comment.name} className="activity-log__comment">
            <div className="activity-log__comment-header">
              <span className="activity-log__avatar">{comment.owner.charAt(0).toUpperCase()}</span>
              <span className="activity-log__owner">{comment.owner}</span>
              <span className="activity-log__time">{relativeTime(comment.creation)}</span>
              {canDelete && (
                <button
                  className="activity-log__delete"
                  aria-label="delete"
                  onClick={() => onDeleteComment(comment.name)}
                >
                  Del
                </button>
              )}
            </div>
            <div
              className="activity-log__content"
              dangerouslySetInnerHTML={{ __html: sanitized }}
            />
          </div>
        );
      })}
    </div>
  );
}
