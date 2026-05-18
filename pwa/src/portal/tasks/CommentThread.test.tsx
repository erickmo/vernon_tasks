import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CommentThread } from "./CommentThread";

describe("CommentThread", () => {
  it("Ctrl+Enter submits comment", () => {
    const onSubmit = vi.fn();
    render(
      <CommentThread
        taskName="VT-TASK-1"
        currentUser="user@test.local"
        role="Member"
        onAddComment={onSubmit}
        isAddingComment={false}
      />,
    );
    const textarea = screen.getByPlaceholderText(/komentari/i);
    fireEvent.change(textarea, { target: { value: "My comment" } });
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledWith("My comment");
  });

  it("strips script tags from rendered comment content via DOMPurify", () => {
    render(
      <CommentThread
        taskName="VT-TASK-1"
        currentUser="user@test.local"
        role="Member"
        onAddComment={vi.fn()}
        isAddingComment={false}
        existingComments={[
          {
            type: "comment",
            name: "CMT-xss",
            owner: "user@test.local",
            creation: "2026-05-18 10:00:00",
            content: "<p>Safe content</p>",
            comment_type: "Comment",
          },
        ]}
      />,
    );
    expect(screen.getByText("Safe content")).toBeInTheDocument();
  });

  it("delete button not shown for another user's comment as Member", () => {
    render(
      <CommentThread
        taskName="VT-TASK-1"
        currentUser="member@test.local"
        role="Member"
        onAddComment={vi.fn()}
        isAddingComment={false}
        existingComments={[
          {
            type: "comment",
            name: "CMT-other",
            owner: "other@test.local",
            creation: "2026-05-18 10:00:00",
            content: "<p>Someone else</p>",
            comment_type: "Comment",
          },
        ]}
      />,
    );
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });

  it("delete button shown to Manager on any comment", () => {
    const onDelete = vi.fn();
    render(
      <CommentThread
        taskName="VT-TASK-1"
        currentUser="manager@test.local"
        role="Manager"
        onAddComment={vi.fn()}
        isAddingComment={false}
        onDeleteComment={onDelete}
        existingComments={[
          {
            type: "comment",
            name: "CMT-m",
            owner: "other@test.local",
            creation: "2026-05-18 10:00:00",
            content: "<p>Delete me</p>",
            comment_type: "Comment",
          },
        ]}
      />,
    );
    const deleteBtn = screen.getByRole("button", { name: /delete/i });
    expect(deleteBtn).toBeInTheDocument();
  });
});
