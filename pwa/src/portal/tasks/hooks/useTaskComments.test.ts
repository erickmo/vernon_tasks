import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useTaskComments } from "./useTaskComments";
import * as tasksApi from "../api/tasks";

vi.mock("../api/tasks", () => ({
  getTaskComments: vi.fn(async () => [
    {
      type: "comment",
      name: "CMT-1",
      owner: "user@test.local",
      creation: "2026-05-18 10:00:00",
      content: "<p>Hello</p>",
      comment_type: "Comment",
    },
  ]),
  addComment: vi.fn(async (_task: string, content: string) => ({
    type: "comment",
    name: "CMT-new",
    owner: "user@test.local",
    creation: "2026-05-18 11:00:00",
    content,
    comment_type: "Comment",
  })),
  deleteComment: vi.fn(async () => ({ ok: true })),
}));

function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("useTaskComments", () => {
  let qc: QueryClient;
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.clearAllMocks();
  });

  it("fetches and returns activity entries", async () => {
    const { result } = renderHook(() => useTaskComments("VT-TASK-1"), {
      wrapper: makeWrapper(qc),
    });
    await waitFor(() => expect(result.current.entries.length).toBeGreaterThan(0));
    expect(result.current.entries[0].name).toBe("CMT-1");
  });

  it("addComment calls API and invalidates cache", async () => {
    const { result } = renderHook(() => useTaskComments("VT-TASK-1"), {
      wrapper: makeWrapper(qc),
    });
    await waitFor(() => expect(result.current.entries).toBeDefined());
    await act(async () => {
      await result.current.addComment("<p>New comment</p>");
    });
    expect(tasksApi.addComment).toHaveBeenCalledWith("VT-TASK-1", "<p>New comment</p>");
  });

  it("deleteComment calls API and invalidates cache", async () => {
    const { result } = renderHook(() => useTaskComments("VT-TASK-1"), {
      wrapper: makeWrapper(qc),
    });
    await waitFor(() => expect(result.current.entries).toBeDefined());
    await act(async () => {
      await result.current.deleteComment("CMT-1");
    });
    expect(tasksApi.deleteComment).toHaveBeenCalledWith("CMT-1");
  });
});
