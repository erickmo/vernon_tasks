import { useState, useRef } from "react";
import DOMPurify from "dompurify";
import type { CommentEntry } from "./api/types";

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
  taskName: string;
  currentUser: string;
  role: "Manager" | "Leader" | "Member" | null;
  onAddComment: (content: string) => void;
  isAddingComment: boolean;
  existingComments?: CommentEntry[];
  onDeleteComment?: (name: string) => Promise<void>;
}

export function CommentThread({
  taskName: _taskName,
  currentUser,
  role,
  onAddComment,
  isAddingComment,
  existingComments = [],
  onDeleteComment,
}: Props) {
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && e.ctrlKey && draft.trim()) {
      onAddComment(draft.trim());
      setDraft("");
    }
  }

  function handleSubmit() {
    if (draft.trim()) {
      onAddComment(draft.trim());
      setDraft("");
    }
  }

  return (
    <div className="comment-thread">
      {existingComments.map((comment) => {
        const canDelete =
          role === "Manager" || role === "Leader" || comment.owner === currentUser;
        const sanitized = DOMPurify.sanitize(comment.content);
        return (
          <div key={comment.name} className="comment-thread__item">
            <div className="comment-thread__header">
              <span className="comment-thread__avatar">{comment.owner.charAt(0).toUpperCase()}</span>
              <span className="comment-thread__owner">{comment.owner}</span>
              <span className="comment-thread__time">{relativeTime(comment.creation)}</span>
              {canDelete && onDeleteComment && (
                <button
                  className="comment-thread__delete"
                  aria-label="delete"
                  onClick={() => onDeleteComment(comment.name)}
                >
                  Del
                </button>
              )}
            </div>
            <div
              className="comment-thread__content"
              dangerouslySetInnerHTML={{ __html: sanitized }}
            />
          </div>
        );
      })}

      <div className="comment-thread__composer">
        <textarea
          ref={textareaRef}
          className="comment-thread__textarea"
          placeholder="Komentari tugas ini... (Ctrl+Enter untuk kirim)"
          value={draft}
          maxLength={1000}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="comment-thread__send"
          onClick={handleSubmit}
          disabled={isAddingComment || !draft.trim()}
        >
          {isAddingComment ? "Mengirim..." : "Kirim"}
        </button>
      </div>
    </div>
  );
}
