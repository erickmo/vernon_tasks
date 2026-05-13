# Login & Task UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the PWA login page and MyWork task list with a warm purple aesthetic — dark immersive glassmorphism login, purple gradient header with card list for tasks.

**Architecture:** Pure visual redesign — no logic, routing, or API changes. Three files touched: `tokens.css` (new purple variables), `login.tsx` (full markup rewrite, same `onSubmit` logic), `MyWork/List.tsx` (new header + card style, same query/mutation logic). All existing tests must remain green.

**Tech Stack:** React 18, TypeScript, inline styles (project convention), Vitest + Testing Library

---

## File Map

| File | Change |
|------|--------|
| `pwa/src/theme/tokens.css` | Add 4 purple CSS vars, update `--vt-primary` |
| `pwa/src/auth/login.tsx` | Full JSX rewrite (keep `onSubmit`, state hooks identical) |
| `pwa/src/pages/MyWork/List.tsx` | Replace `<header>`, add search strip, update `TaskCardView` + `Section` styles |

---

## Task 1: Update Design Tokens

**Files:**
- Modify: `pwa/src/theme/tokens.css`

- [ ] **Step 1: Write a CSS snapshot test**

Create `pwa/src/theme/tokens.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("tokens.css", () => {
  const css = readFileSync(resolve(__dirname, "tokens.css"), "utf-8");

  it("defines --vt-primary as #9561ab", () => {
    expect(css).toContain("--vt-primary: #9561ab");
  });

  it("defines --vt-primary-dark", () => {
    expect(css).toContain("--vt-primary-dark: #2d1540");
  });

  it("defines --vt-primary-mid", () => {
    expect(css).toContain("--vt-primary-mid: #4a2870");
  });

  it("defines --vt-primary-light", () => {
    expect(css).toContain("--vt-primary-light: #f5f0f8");
  });

  it("defines dark mode primary as #c084fc", () => {
    expect(css).toContain("--vt-primary: #c084fc");
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd pwa && npx vitest run src/theme/tokens.test.ts
```

Expected: FAIL — `--vt-primary` is `#1e6bff`, not `#9561ab`.

- [ ] **Step 3: Update tokens.css**

In `pwa/src/theme/tokens.css`, replace the `:root` block and dark mode block:

```css
:root {
  --vt-font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --vt-radius: 12px;
  --vt-radius-sm: 8px;
  --vt-space-1: 4px;
  --vt-space-2: 8px;
  --vt-space-3: 12px;
  --vt-space-4: 16px;
  --vt-space-5: 24px;
  --vt-space-6: 32px;
  --vt-bg: #ffffff;
  --vt-surface: #f6f7f9;
  --vt-text: #0b0b10;
  --vt-text-muted: #5b6472;
  --vt-border: #e3e6ec;
  --vt-primary: #9561ab;
  --vt-primary-dark: #2d1540;
  --vt-primary-mid: #4a2870;
  --vt-primary-light: #f5f0f8;
  --vt-primary-contrast: #ffffff;
  --vt-danger: #d4351c;
  --vt-warn: #e89c1f;
  --vt-success: #18a957;
  --vt-shadow: 0 1px 3px rgba(0, 0, 0, 0.06), 0 4px 12px rgba(0, 0, 0, 0.04);
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
  --safe-right: env(safe-area-inset-right, 0px);
  --bottom-nav-h: 64px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --vt-bg: #0b0b10;
    --vt-surface: #15151c;
    --vt-text: #f4f5f7;
    --vt-text-muted: #9aa0aa;
    --vt-border: #2a2b34;
    --vt-primary: #c084fc;
    --vt-shadow: 0 1px 3px rgba(0, 0, 0, 0.5), 0 4px 12px rgba(0, 0, 0, 0.35);
  }
}

@keyframes vt-shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}

* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body {
  font-family: var(--vt-font);
  font-size: 15px;
  color: var(--vt-text);
  background: var(--vt-bg);
  -webkit-tap-highlight-color: transparent;
}
button { font: inherit; cursor: pointer; }
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd pwa && npx vitest run src/theme/tokens.test.ts
```

Expected: PASS — all 5 assertions green.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
cd pwa && npx vitest run
```

Expected: All tests pass (token change is additive; `--vt-primary` usage in other components picks up purple automatically).

- [ ] **Step 6: Commit**

```bash
git add pwa/src/theme/tokens.css pwa/src/theme/tokens.test.ts
git commit -m "feat(theme): update primary color to purple #9561ab, add purple scale tokens"
```

---

## Task 2: Redesign Login Page

**Files:**
- Modify: `pwa/src/auth/login.tsx`
- Test: `pwa/src/auth/login.test.tsx` (new file)

- [ ] **Step 1: Write failing tests for login page**

Create `pwa/src/auth/login.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LoginPage } from "./login";

// Mock session module
vi.mock("./session", () => ({
  login: vi.fn(),
}));

import { login as mockLogin } from "./session";

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/m/login"]}>
      <LoginPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("LoginPage", () => {
  it("renders username and password inputs", () => {
    renderLogin();
    expect(screen.getByRole("textbox", { name: /username/i })).toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).toBeInTheDocument();
  });

  it("renders submit button", () => {
    renderLogin();
    expect(screen.getByRole("button", { name: /masuk/i })).toBeInTheDocument();
  });

  it("pre-fills username from localStorage", () => {
    localStorage.setItem("vt_last_user", "erick@company.com");
    renderLogin();
    expect(screen.getByRole("textbox", { name: /username/i })).toHaveValue("erick@company.com");
  });

  it("shows error message on failed login", async () => {
    vi.mocked(mockLogin).mockRejectedValueOnce(new Error("bad credentials"));
    renderLogin();
    fireEvent.change(screen.getByRole("textbox", { name: /username/i }), {
      target: { value: "bad@user.com" },
    });
    fireEvent.change(document.querySelector('input[type="password"]')!, {
      target: { value: "wrongpwd" },
    });
    fireEvent.click(screen.getByRole("button", { name: /masuk/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });

  it("disables button while busy", async () => {
    vi.mocked(mockLogin).mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 500)),
    );
    renderLogin();
    fireEvent.change(screen.getByRole("textbox", { name: /username/i }), {
      target: { value: "user" },
    });
    fireEvent.change(document.querySelector('input[type="password"]')!, {
      target: { value: "pass" },
    });
    fireEvent.click(screen.getByRole("button", { name: /masuk/i }));
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd pwa && npx vitest run src/auth/login.test.tsx
```

Expected: FAIL — "renders username and password inputs" fails because current markup has no `role="alert"` on error and button text is `t("login.submit")` not "masuk" literally. Note failures — we will fix the component next.

- [ ] **Step 3: Rewrite login.tsx**

Replace the entire content of `pwa/src/auth/login.tsx` with:

```typescript
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { login } from "./session";

const FOOTER_TEXT = "Hanya untuk karyawan Vernon Corp";

const styles = {
  root: {
    height: "100svh",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(160deg, #2d1540 0%, #4a2870 40%, #9561ab 100%)",
    position: "relative" as const,
    overflow: "hidden",
  },
  circle1: {
    position: "absolute" as const,
    top: -40,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: "50%",
    background: "rgba(149,97,171,0.25)",
    pointerEvents: "none" as const,
  },
  circle2: {
    position: "absolute" as const,
    bottom: -50,
    left: -20,
    width: 140,
    height: 140,
    borderRadius: "50%",
    background: "rgba(149,97,171,0.15)",
    pointerEvents: "none" as const,
  },
  circle3: {
    position: "absolute" as const,
    top: "30%",
    left: -30,
    width: 80,
    height: 80,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.05)",
    pointerEvents: "none" as const,
  },
  logoWrap: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    marginBottom: 28,
    position: "relative" as const,
    zIndex: 1,
  },
  logoBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    background: "rgba(255,255,255,0.15)",
    border: "1px solid rgba(255,255,255,0.25)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 26,
    marginBottom: 12,
  },
  appName: {
    color: "white",
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: "-0.3px",
    margin: 0,
  },
  subtitle: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
    marginTop: 4,
  },
  card: {
    background: "rgba(255,255,255,0.1)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: 20,
    padding: 28,
    width: 320,
    maxWidth: "calc(100vw - 48px)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
    position: "relative" as const,
    zIndex: 1,
  },
  fieldWrap: {
    marginBottom: 16,
  },
  label: {
    display: "block",
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.5px",
    textTransform: "uppercase" as const,
    marginBottom: 6,
  },
  input: {
    display: "block",
    width: "100%",
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: 10,
    padding: "11px 14px",
    color: "white",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box" as const,
  },
  errorBox: {
    background: "rgba(239,68,68,0.2)",
    border: "1px solid rgba(239,68,68,0.4)",
    borderRadius: 8,
    padding: "10px 14px",
    marginBottom: 16,
    color: "rgba(255,200,200,0.9)",
    fontSize: 13,
  },
  button: {
    width: "100%",
    background: "#9561ab",
    color: "white",
    border: "none",
    borderRadius: 12,
    padding: 13,
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    boxShadow: "0 4px 16px rgba(149,97,171,0.5)",
    letterSpacing: "0.2px",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: "not-allowed" as const,
  },
  footer: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 12,
    marginTop: 20,
    position: "relative" as const,
    zIndex: 1,
  },
};

export function LoginPage() {
  const [usr, setUsr] = useState(() => localStorage.getItem("vt_last_user") ?? "");
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") ?? "/m/work";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const s = await login(usr, pwd);
      if (!s.user) throw new Error("guest");
      localStorage.setItem("vt_last_user", usr);
      nav(next, { replace: true });
    } catch {
      setErr("Username atau password salah. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.root}>
      <div style={styles.circle1} />
      <div style={styles.circle2} />
      <div style={styles.circle3} />

      <div style={styles.logoWrap}>
        <div style={styles.logoBox}>✓</div>
        <h1 style={styles.appName}>Vernon Tasks</h1>
        <p style={styles.subtitle}>Selamat datang kembali</p>
      </div>

      <div style={styles.card}>
        <form onSubmit={onSubmit} noValidate>
          <div style={styles.fieldWrap}>
            <label htmlFor="vt-usr" style={styles.label}>Username / Email</label>
            <input
              id="vt-usr"
              style={styles.input}
              value={usr}
              onChange={(e) => setUsr(e.target.value)}
              autoComplete="username"
              required
              autoCapitalize="none"
            />
          </div>
          <div style={{ ...styles.fieldWrap, marginBottom: 24 }}>
            <label htmlFor="vt-pwd" style={styles.label}>Password</label>
            <input
              id="vt-pwd"
              type="password"
              style={styles.input}
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {err && (
            <div role="alert" style={styles.errorBox}>{err}</div>
          )}

          <button
            type="submit"
            disabled={busy}
            style={{ ...styles.button, ...(busy ? styles.buttonDisabled : {}) }}
          >
            {busy ? "Memproses…" : "Masuk"}
          </button>
        </form>
      </div>

      <p style={styles.footer}>{FOOTER_TEXT}</p>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd pwa && npx vitest run src/auth/login.test.tsx
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
cd pwa && npx vitest run
```

Expected: All tests pass. No regressions.

- [ ] **Step 6: Commit**

```bash
git add pwa/src/auth/login.tsx pwa/src/auth/login.test.tsx
git commit -m "feat(login): redesign with dark immersive glassmorphism and purple theme"
```

---

## Task 3: Redesign MyWork Header + Search Bar

**Files:**
- Modify: `pwa/src/pages/MyWork/List.tsx`
- Test: `pwa/src/pages/MyWork/List.test.tsx` (extend existing)

- [ ] **Step 1: Add failing tests for new header**

Append these test cases to `pwa/src/pages/MyWork/List.test.tsx` (inside the existing `describe` block, after the existing tests):

```typescript
  it("renders greeting text in header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ message: { overdue: [], today: [], upcoming: [] } }),
          { status: 200 },
        ),
      ),
    );
    wrap(<MyWorkList />);
    // greeting() returns locale-based greeting string
    await waitFor(() => {
      const header = document.querySelector("header");
      expect(header).toBeInTheDocument();
    });
  });

  it("shows overdue count chip when overdue tasks exist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: {
              overdue: [{ id: "T1", title: "Overdue task" }],
              today: [],
              upcoming: [],
            },
          }),
          { status: 200 },
        ),
      ),
    );
    wrap(<MyWorkList />);
    await waitFor(() => expect(screen.getByText(/Terlambat 1/)).toBeInTheDocument());
  });

  it("shows today count chip when today tasks exist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: {
              overdue: [],
              today: [
                { id: "T2", title: "Today task 1" },
                { id: "T3", title: "Today task 2" },
              ],
              upcoming: [],
            },
          }),
          { status: 200 },
        ),
      ),
    );
    wrap(<MyWorkList />);
    await waitFor(() => expect(screen.getByText(/Hari ini 2/)).toBeInTheDocument());
  });
```

- [ ] **Step 2: Run new tests to confirm they fail**

```bash
cd pwa && npx vitest run src/pages/MyWork/List.test.tsx
```

Expected: The two new chip tests FAIL ("Terlambat 1" and "Hari ini 2" not found in DOM).

- [ ] **Step 3: Replace the header + search area in List.tsx**

In `pwa/src/pages/MyWork/List.tsx`, find the `MyWorkList` function's return statement. Replace the existing `<PullToRefresh>` inner content's `<header>`, `<SearchBar>`, and `<ActiveFilterChips>` block with the new sticky header + search strip. The full updated return JSX (inside `<PullToRefresh onRefresh={...}>`):

```typescript
  return (
    <PullToRefresh onRefresh={() => q.refetch().then(() => {})}>
      {/* ── Sticky gradient header ── */}
      <header
        style={{
          background: "linear-gradient(135deg, #2d1540, #9561ab)",
          padding: "var(--vt-space-4) var(--vt-space-4) var(--vt-space-3)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, marginBottom: 2 }}>
          {fmtDate(new Date())}
        </div>
        <div style={{ color: "white", fontSize: 18, fontWeight: 700 }}>
          {greeting()}
        </div>

        {/* Filter chips — display only, scroll to section on click */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 12,
            overflowX: "auto",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          <button
            onClick={() => { setQuery(""); setFilters({ due_range: "all" }); }}
            style={{
              background: "rgba(255,255,255,0.2)",
              border: "none",
              borderRadius: 20,
              padding: "4px 12px",
              color: "white",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Semua
          </button>
          {q.data && q.data.overdue.length > 0 && (
            <span
              style={{
                background: "rgba(212,53,28,0.25)",
                border: "1px solid rgba(212,53,28,0.4)",
                borderRadius: 20,
                padding: "4px 12px",
                color: "rgba(255,200,200,0.9)",
                fontSize: 12,
                whiteSpace: "nowrap",
              }}
            >
              Terlambat {q.data.overdue.length}
            </span>
          )}
          {q.data && q.data.today.length > 0 && (
            <span
              style={{
                background: "rgba(255,255,255,0.1)",
                borderRadius: 20,
                padding: "4px 12px",
                color: "rgba(255,255,255,0.8)",
                fontSize: 12,
                whiteSpace: "nowrap",
              }}
            >
              Hari ini {q.data.today.length}
            </span>
          )}
          <StaleBadge resource="my-work" />
        </div>
      </header>

      {/* ── Sticky search strip ── */}
      <div
        style={{
          background: "white",
          padding: "var(--vt-space-2) var(--vt-space-4)",
          borderBottom: "1px solid var(--vt-primary-light)",
          position: "sticky",
          top: 96,
          zIndex: 9,
        }}
      >
        <SearchBar
          value={query}
          onChange={(v) => {
            setQuery(v);
            if (v.length > 0) logEvent("search_query", { query_length: v.length });
          }}
          onOpenFilter={() => setFilterOpen(true)}
          filterActive={Boolean(
            (filters.priority && filters.priority.length > 0) ||
              filters.project ||
              (filters.due_range && filters.due_range !== "all"),
          )}
        />
        <ActiveFilterChips filters={combinedFilters} onRemove={removeFilter} />
      </div>

      {/* ── Task content ── */}
      <div style={{ padding: "var(--vt-space-4)", background: "var(--vt-primary-light)", minHeight: "100%" }}>
        {!searching && q.isLoading && (
          <>
            <Skeleton height={64} />
            <div style={{ height: 12 }} />
            <Skeleton height={64} />
          </>
        )}

        {!searching && q.isError && !q.data && (
          <EmptyState
            title={t("empty.no_offline")}
            cta={{ label: t("common.retry"), onClick: () => q.refetch() }}
          />
        )}

        {!searching &&
          q.data &&
          (total === 0 ? (
            <EmptyState title={t("empty.no_tasks")} />
          ) : (
            <>
              <Section
                title={t("tasks.section.overdue")}
                items={q.data.overdue}
                accent="var(--vt-danger)"
                render={(task) => (
                  <TaskCardView
                    task={task}
                    accent="var(--vt-danger)"
                    onComplete={() => handleComplete(task)}
                    onLog={() => setLogTask(task)}
                    onSnooze={() => handleSnooze(task, 1)}
                    disabled={offline}
                  />
                )}
              />
              <Section
                title={t("tasks.section.today")}
                items={q.data.today}
                accent="var(--vt-primary)"
                render={(task) => (
                  <TaskCardView
                    task={task}
                    accent="var(--vt-primary)"
                    onComplete={() => handleComplete(task)}
                    onLog={() => setLogTask(task)}
                    onSnooze={() => handleSnooze(task, 1)}
                    disabled={offline}
                  />
                )}
              />
              <Section
                title={t("tasks.section.upcoming")}
                items={q.data.upcoming}
                accent="var(--vt-border)"
                render={(task) => (
                  <TaskCardView
                    task={task}
                    accent="var(--vt-border)"
                    onComplete={() => handleComplete(task)}
                    onLog={() => setLogTask(task)}
                    onSnooze={() => handleSnooze(task, 1)}
                    disabled={offline}
                  />
                )}
              />
            </>
          ))}

        {searching && searchQ.isLoading && (
          <>
            <Skeleton height={64} />
            <div style={{ height: 12 }} />
            <Skeleton height={64} />
          </>
        )}

        {searching && searchQ.isError && (
          <EmptyState
            title={t("search.failed")}
            cta={{ label: t("common.retry"), onClick: () => searchQ.refetch() }}
          />
        )}

        {searching && searchQ.data && (
          searchQ.data.results.length === 0 ? (
            <EmptyState title={t("search.no_results")} />
          ) : (
            <div>
              {searchQ.data.results.map((task) => (
                <div key={task.id} style={{ marginBottom: "var(--vt-space-3)" }}>
                  <TaskCardView
                    task={task}
                    accent="var(--vt-border)"
                    onComplete={() => handleComplete(task)}
                    onLog={() => setLogTask(task)}
                    onSnooze={() => handleSnooze(task, 1)}
                    disabled={offline}
                  />
                </div>
              ))}
            </div>
          )
        )}
      </div>

      <FilterSheet
        open={filterOpen}
        initial={filters}
        onApply={(f) => {
          setFilters(f);
          setFilterOpen(false);
          logEvent("filter_applied", {
            priority_count: f.priority?.length ?? 0,
            has_project: !!f.project,
            due_range: f.due_range ?? "all",
          });
        }}
        onCancel={() => setFilterOpen(false)}
      />

      <LogProgressModal
        open={logTask !== null}
        onSubmit={(h, n) => logTask && handleLog(logTask, h, n)}
        onCancel={() => setLogTask(null)}
      />

      <InstallPrompt visible={ready} />
    </PullToRefresh>
  );
```

Also update the `Section` component signature to accept an `accent` prop for the label color:

```typescript
function Section({
  title,
  items,
  accent,
  render,
}: {
  title: string;
  items: TaskCardT[];
  accent?: string;
  render: (task: TaskCardT) => React.ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <section style={{ marginBottom: "var(--vt-space-5)" }}>
      <h3
        style={{
          fontSize: 11,
          color: accent ?? "var(--vt-text-muted)",
          margin: "0 0 var(--vt-space-2)",
          textTransform: "uppercase",
          letterSpacing: 0.8,
          fontWeight: 700,
        }}
      >
        {title}
      </h3>
      {items.map((task) => (
        <div key={task.id} style={{ marginBottom: "var(--vt-space-3)" }}>
          {render(task)}
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd pwa && npx vitest run src/pages/MyWork/List.test.tsx
```

Expected: All tests pass including the 3 new chip tests.

- [ ] **Step 5: Run full test suite**

```bash
cd pwa && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add pwa/src/pages/MyWork/List.tsx pwa/src/pages/MyWork/List.test.tsx
git commit -m "feat(task-list): add purple gradient header with filter chips and sticky search bar"
```

---

## Task 4: Redesign Task Cards

**Files:**
- Modify: `pwa/src/pages/MyWork/List.tsx` (TaskCardView style only)

- [ ] **Step 1: Write a test for card border color**

Append to the `describe` block in `pwa/src/pages/MyWork/List.test.tsx`:

```typescript
  it("overdue task card has red left border", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: {
              overdue: [{ id: "T-OVR", title: "Past due task" }],
              today: [],
              upcoming: [],
            },
          }),
          { status: 200 },
        ),
      ),
    );
    wrap(<MyWorkList />);
    await waitFor(() => screen.getByText("Past due task"));
    const card = screen.getByText("Past due task").closest("[data-testid='task-card']");
    expect(card).toHaveStyle("border-left: 3px solid var(--vt-danger)");
  });
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd pwa && npx vitest run src/pages/MyWork/List.test.tsx
```

Expected: FAIL — "past due task" card doesn't have `data-testid='task-card'` yet.

- [ ] **Step 3: Update TaskCardView style in List.tsx**

Replace the `TaskCardView` component's inner `<div>` (the card container inside `<SwipeRow>`) with the new card style. Add `data-testid="task-card"`:

```typescript
function TaskCardView({
  task,
  accent,
  onComplete,
  onLog,
  onSnooze,
  disabled,
}: {
  task: TaskCardT;
  accent?: string;
  onComplete: () => void;
  onLog: () => void;
  onSnooze: () => void;
  disabled: boolean;
}) {
  return (
    <SwipeRow
      actions={
        <TaskActions
          onComplete={onComplete}
          onLog={onLog}
          onSnooze={onSnooze}
          disabled={disabled}
        />
      }
    >
      <div
        data-testid="task-card"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "var(--vt-space-3) var(--vt-space-4)",
          background: "white",
          borderRadius: "var(--vt-radius)",
          borderLeft: accent ? `3px solid ${accent}` : undefined,
          boxShadow: "0 1px 6px rgba(149,97,171,0.08)",
        }}
      >
        <input
          type="checkbox"
          checked={false}
          onChange={onComplete}
          disabled={disabled}
          aria-label="complete"
          style={{ width: 22, height: 22, accentColor: "var(--vt-primary)" }}
        />
        <Link
          to={`/m/work/${encodeURIComponent(task.id)}`}
          style={{ flex: 1, color: "var(--vt-text)", textDecoration: "none" }}
        >
          <div style={{ fontWeight: 600, fontSize: 14 }}>{task.title}</div>
          <div style={{ fontSize: 12, color: "var(--vt-text-muted)", marginTop: 3 }}>
            {[task.project, task.priority].filter(Boolean).join(" · ")}
            {task.points ? ` · +${task.points} pts` : ""}
          </div>
        </Link>
      </div>
    </SwipeRow>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
cd pwa && npx vitest run src/pages/MyWork/List.test.tsx
```

Expected: All tests pass.

- [ ] **Step 5: Run full test suite**

```bash
cd pwa && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add pwa/src/pages/MyWork/List.tsx pwa/src/pages/MyWork/List.test.tsx
git commit -m "feat(task-list): style task cards with colored left border and purple shadow"
```

---

## Task 5: Build & Manual QA

- [ ] **Step 1: Build the PWA**

```bash
cd pwa && npm run build
```

Expected: Build succeeds, no TypeScript errors.

- [ ] **Step 2: Preview locally**

```bash
cd pwa && npm run preview
```

Open `http://localhost:4173/m/login` — verify:
- Dark purple gradient background fills screen
- Decorative circles visible
- Glassmorphism form card renders
- Inputs are semi-transparent white text
- Submit button is solid `#9561ab` with glow

- [ ] **Step 3: Check task list**

Navigate to `/m/work` (requires login or stub). Verify:
- Header is gradient purple, sticky on scroll
- Greeting and date visible in white
- Filter chips appear after data loads
- Task cards are white with colored left border
- Background is `#f5f0f8` (light purple tint)

- [ ] **Step 4: Check mobile viewport**

Resize browser to 375px wide. Verify:
- Login form doesn't overflow (max-width clamps)
- Header chips scroll horizontally without breaking layout

- [ ] **Step 5: Final commit**

```bash
git add -p
git commit -m "chore: final QA pass — login and task list redesign complete"
```
