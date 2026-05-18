import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityLog } from "./ActivityLog";
import type { ActivityEntry } from "./api/types";

const FIXTURE: ActivityEntry[] = [
  {
    type: "comment",
    name: "CMT-1",
    owner: "alice@test.local",
    creation: "2026-05-18 09:00:00",
    content: "<p>First comment</p>",
    comment_type: "Comment",
  },
  {
    type: "version",
    name: "VER-1",
    owner: "bob@test.local",
    creation: "2026-05-18 09:30:00",
    changes: [["kanban_status", "Backlog", "In Progress"]],
  },
  {
    type: "comment",
    name: "CMT-2",
    owner: "bob@test.local",
    creation: "2026-05-18 10:00:00",
    content: "<p>Second comment</p>",
    comment_type: "Comment",
  },
  {
    type: "version",
    name: "VER-2",
    owner: "alice@test.local",
    creation: "2026-05-18 10:30:00",
    changes: [["priority", "Medium", "High"]],
  },
  {
    type: "comment",
    name: "CMT-3",
    owner: "alice@test.local",
    creation: "2026-05-18 11:00:00",
    content: "<p>Third comment</p>",
    comment_type: "Comment",
  },
];

describe("ActivityLog", () => {
  it("renders comment entries with owner", () => {
    render(<ActivityLog entries={FIXTURE} currentUser="alice@test.local" role="Manager" onDeleteComment={() => Promise.resolve()} />);
    expect(screen.getAllByText("alice@test.local").length).toBeGreaterThan(0);
  });

  it("renders version diff lines with human-readable field label", () => {
    render(<ActivityLog entries={FIXTURE} currentUser="alice@test.local" role="Manager" onDeleteComment={() => Promise.resolve()} />);
    expect(screen.getByText(/Status:/)).toBeInTheDocument();
    expect(screen.getByText(/Backlog/)).toBeInTheDocument();
    expect(screen.getByText(/In Progress/)).toBeInTheDocument();
  });

  it("snapshot: 5-entry fixture", () => {
    const { container } = render(
      <ActivityLog entries={FIXTURE} currentUser="alice@test.local" role="Member" onDeleteComment={() => Promise.resolve()} />,
    );
    expect(container).toMatchSnapshot();
  });
});
