# Login Page 2-Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Override Frappe's default login page with a beautiful 2-panel design (gradient mural left + clean form right) at `task.localhost:8080/login`.

**Architecture:** Create `vernon_tasks/www/login.html` (Jinja template) + `vernon_tasks/www/login.py` (context script). Frappe resolves `www/login.html` from installed apps before its own default, so no hooks change needed. Login calls `/api/method/login` via fetch, redirects to `/m/work` on success.

**Tech Stack:** Frappe Jinja templates, vanilla JS fetch API, inline CSS (no external dependencies)

---

### Task 1: Context Script

**Files:**
- Create: `vernon_tasks/www/login.py`

- [ ] **Step 1: Create `vernon_tasks/www/login.py`**

```python
import frappe

no_cache = 1


def get_context(context):
    if frappe.session.user != "Guest":
        frappe.local.flags.redirect_location = "/m/work"
        raise frappe.Redirect

    context.csrf_token = frappe.sessions.get_csrf_token()
    context.redirect_to = frappe.form_dict.get("redirect_to") or "/m/work"
    context.dev_shortcuts = _get_dev_shortcuts()


def _get_dev_shortcuts() -> list[dict]:
    if not frappe.conf.get("developer_mode"):
        return []
    return [
        {"usr": "Administrator", "pwd": "admin", "label": "Administrator"},
    ]
```

- [ ] **Step 2: Verify file exists**

```bash
ls -la apps/vernon_tasks/vernon_tasks/www/login.py
```

Expected: file exists, ~20 lines.

- [ ] **Step 3: Commit**

```bash
git add apps/vernon_tasks/vernon_tasks/www/login.py
git commit -m "feat(login): add www/login.py context script with redirect + dev shortcuts"
```

---

### Task 2: HTML Template

**Files:**
- Create: `vernon_tasks/www/login.html`

- [ ] **Step 1: Create `vernon_tasks/www/login.html`**

```html
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Masuk — Vernon Tasks</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
  height: 100vh;
  display: flex;
  background: #4f3cc9;
}

/* ── LEFT PANEL ── */
.vl-left {
  flex: 1.35;
  background: linear-gradient(145deg, #4f3cc9 0%, #7c3aed 35%, #a855f7 65%, #f093fb 100%);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 44px 48px;
  position: relative;
  overflow: hidden;
}

.vl-left::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0px, transparent 1px, transparent 48px),
    repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0px, transparent 1px, transparent 48px);
  pointer-events: none;
}

.vl-blob-tl {
  position: absolute; top: -60px; left: -40px;
  width: 250px; height: 250px; border-radius: 50%;
  background: rgba(255,255,255,0.06);
  filter: blur(40px); pointer-events: none;
}
.vl-blob-br {
  position: absolute; bottom: -80px; right: -50px;
  width: 320px; height: 320px; border-radius: 50%;
  background: rgba(79,60,201,0.4);
  filter: blur(60px); pointer-events: none;
}

.vl-logo {
  display: flex; align-items: center; gap: 10px;
  position: relative; z-index: 1;
}
.vl-logo-icon {
  width: 34px; height: 34px;
  background: rgba(255,255,255,0.2);
  border: 1px solid rgba(255,255,255,0.3);
  border-radius: 9px;
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; color: white;
}
.vl-logo-name {
  color: white; font-size: 14px; font-weight: 700; letter-spacing: -0.2px;
}

.vl-body {
  position: relative; z-index: 1; flex: 1;
  display: flex; flex-direction: column; justify-content: center;
  padding: 40px 0;
}
.vl-eyebrow {
  font-size: 11px; font-weight: 700; letter-spacing: 1.5px;
  text-transform: uppercase; color: rgba(255,255,255,0.55); margin-bottom: 14px;
}
.vl-headline {
  font-size: 34px; font-weight: 800; line-height: 1.2;
  letter-spacing: -0.8px; color: white;
  text-shadow: 0 2px 24px rgba(0,0,0,0.15); margin-bottom: 14px;
}
.vl-sub {
  font-size: 14px; color: rgba(255,255,255,0.6);
  line-height: 1.55; max-width: 340px; margin-bottom: 36px;
}

.vl-features { display: flex; flex-direction: column; gap: 14px; }
.vl-feature { display: flex; align-items: flex-start; gap: 12px; }
.vl-feature-icon {
  width: 36px; height: 36px; flex-shrink: 0;
  background: rgba(255,255,255,0.15);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 9px;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px;
}
.vl-feature-name {
  font-size: 13px; font-weight: 700; color: white;
  letter-spacing: -0.2px; margin-bottom: 2px;
}
.vl-feature-desc { font-size: 11px; color: rgba(255,255,255,0.5); line-height: 1.4; }

.vl-trust {
  position: relative; z-index: 1;
  display: inline-flex; align-items: center; gap: 7px;
  background: rgba(255,255,255,0.12);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 24px; padding: 7px 14px;
  font-size: 12px; color: rgba(255,255,255,0.8); font-weight: 500;
  width: fit-content;
}
.vl-trust-dot {
  width: 7px; height: 7px; border-radius: 50%; background: #34d399; flex-shrink: 0;
}

/* ── RIGHT PANEL ── */
.vl-right {
  flex: 1;
  background: #ffffff;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 48px 52px;
}

.vl-form-wrap { width: 100%; max-width: 340px; }

.vl-form-title {
  font-size: 24px; font-weight: 800;
  letter-spacing: -0.5px; color: #0f0a1e; margin-bottom: 6px;
}
.vl-form-sub { font-size: 13px; color: #9ca3af; margin-bottom: 32px; line-height: 1.5; }

.vl-label {
  display: block;
  font-size: 11px; font-weight: 700;
  letter-spacing: 0.6px; text-transform: uppercase;
  color: #6b7280; margin-bottom: 6px;
}
.vl-input {
  display: block; width: 100%;
  border: 1.5px solid #e5e7eb; border-radius: 8px;
  padding: 11px 14px; font-size: 14px; color: #0f0a1e;
  background: #f9fafb; outline: none; margin-bottom: 16px;
  transition: border-color 0.15s, box-shadow 0.15s;
  font-family: inherit;
}
.vl-input:focus {
  border-color: #7c3aed;
  box-shadow: 0 0 0 3px rgba(124,58,237,0.12);
  background: #fff;
}

.vl-error {
  display: none;
  background: rgba(220,38,38,0.06);
  border: 1px solid rgba(220,38,38,0.2);
  border-radius: 8px; padding: 10px 14px;
  margin-bottom: 14px;
  color: #dc2626; font-size: 12px; line-height: 1.4;
}
.vl-error.vl-visible { display: block; }

.vl-btn {
  width: 100%; padding: 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 60%, #a855f7 100%);
  color: white; border: none; border-radius: 8px;
  font-size: 14px; font-weight: 700; font-family: inherit;
  letter-spacing: 0.2px; cursor: pointer;
  margin-top: 4px;
  box-shadow: 0 4px 20px rgba(124,58,237,0.35);
  transition: opacity 0.15s, transform 0.1s;
}
.vl-btn:hover:not(:disabled) { opacity: 0.92; transform: translateY(-1px); }
.vl-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

.vl-footer {
  text-align: center; font-size: 11px; color: #d1d5db; margin-top: 24px;
}

/* Dev shortcuts */
.vl-dev-bar {
  margin-bottom: 20px; padding-bottom: 16px;
  border-bottom: 1px solid #f0f0f0;
}
.vl-dev-label {
  font-size: 10px; font-weight: 700; letter-spacing: 1px;
  text-transform: uppercase; color: #d1d5db; margin-bottom: 8px;
}
.vl-dev-pill {
  padding: 4px 12px; border-radius: 20px;
  border: 1px solid #ede9fe; background: #f5f3ff;
  color: #7c3aed; font-size: 11px; font-weight: 600;
  cursor: pointer; font-family: inherit;
  transition: background 0.12s;
}
.vl-dev-pill:hover { background: #ede9fe; }

@media (max-width: 768px) {
  body { flex-direction: column; height: auto; min-height: 100vh; }
  .vl-left { flex: none; padding: 36px 28px; min-height: 280px; }
  .vl-right { flex: none; padding: 40px 28px; }
  .vl-headline { font-size: 26px; }
  .vl-body { padding: 28px 0; }
}
</style>
</head>
<body>

<div class="vl-left">
  <div class="vl-blob-tl" aria-hidden="true"></div>
  <div class="vl-blob-br" aria-hidden="true"></div>

  <div class="vl-logo">
    <div class="vl-logo-icon">◆</div>
    <span class="vl-logo-name">Vernon Tasks</span>
  </div>

  <div class="vl-body">
    <p class="vl-eyebrow">Task Management Platform</p>
    <h1 class="vl-headline">Satu platform<br>untuk seluruh<br>alur kerja tim.</h1>
    <p class="vl-sub">Hubungkan OKR, sprint, kanban, dan PDCA dalam satu workspace — dirancang untuk tim yang bergerak cepat.</p>

    <div class="vl-features">
      <div class="vl-feature">
        <div class="vl-feature-icon" aria-hidden="true">🎯</div>
        <div>
          <div class="vl-feature-name">OKR Tracking</div>
          <div class="vl-feature-desc">Hubungkan target organisasi ke task harian dengan transparan</div>
        </div>
      </div>
      <div class="vl-feature">
        <div class="vl-feature-icon" aria-hidden="true">🏃</div>
        <div>
          <div class="vl-feature-name">Sprint Board</div>
          <div class="vl-feature-desc">Agile sprint dengan kanban visual dan visibilitas penuh tim</div>
        </div>
      </div>
      <div class="vl-feature">
        <div class="vl-feature-icon" aria-hidden="true">🔄</div>
        <div>
          <div class="vl-feature-name">PDCA Workflow</div>
          <div class="vl-feature-desc">Struktur kerja Plan-Do-Check-Act yang terbukti efektif</div>
        </div>
      </div>
    </div>
  </div>

  <div class="vl-trust">
    <div class="vl-trust-dot" aria-hidden="true"></div>
    Sistem aktif &middot; Vernon Corp
  </div>
</div>

<div class="vl-right">
  <div class="vl-form-wrap">

    {% if dev_shortcuts %}
    <div class="vl-dev-bar">
      <div class="vl-dev-label">Dev — login cepat</div>
      {% for s in dev_shortcuts %}
      <button
        type="button"
        class="vl-dev-pill"
        data-usr="{{ s.usr | e }}"
        data-pwd="{{ s.pwd | e }}"
      >{{ s.label | e }}</button>
      {% endfor %}
    </div>
    {% endif %}

    <h2 class="vl-form-title">Selamat datang 👋</h2>
    <p class="vl-form-sub">Masuk ke workspace Vernon Tasks Anda</p>

    <form id="vl-form" novalidate>
      <input type="hidden" name="csrf_token" value="{{ csrf_token }}">

      <label for="vl-usr" class="vl-label">Email / Username</label>
      <input
        id="vl-usr"
        type="text"
        name="usr"
        class="vl-input"
        autocomplete="username"
        autocapitalize="none"
        autofocus
        required
      >

      <label for="vl-pwd" class="vl-label">Password</label>
      <input
        id="vl-pwd"
        type="password"
        name="pwd"
        class="vl-input"
        autocomplete="current-password"
        required
      >

      <div id="vl-error" class="vl-error" role="alert"></div>

      <button id="vl-btn" type="submit" class="vl-btn">Masuk ke Workspace →</button>
    </form>

    <p class="vl-footer">&copy; 2026 Vernon Corp</p>
  </div>
</div>

<script>
(function () {
  var form = document.getElementById("vl-form");
  var btn  = document.getElementById("vl-btn");
  var errEl = document.getElementById("vl-error");
  var redirect = {{ (redirect_to or "/m/work") | tojson }};

  // Dev shortcut pills — fill form fields on click
  document.querySelectorAll(".vl-dev-pill").forEach(function (pill) {
    pill.addEventListener("click", function () {
      document.getElementById("vl-usr").value = pill.dataset.usr;
      document.getElementById("vl-pwd").value = pill.dataset.pwd;
      document.getElementById("vl-usr").focus();
    });
  });

  function showError(msg) {
    errEl.textContent = msg;
    errEl.classList.add("vl-visible");
  }
  function clearError() {
    errEl.classList.remove("vl-visible");
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    clearError();
    btn.disabled = true;
    btn.textContent = "Memproses...";

    var usr = document.getElementById("vl-usr").value.trim();
    var pwd = document.getElementById("vl-pwd").value;

    try {
      var res = await fetch("/api/method/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Frappe-CSRF-Token": "{{ csrf_token }}",
        },
        body: JSON.stringify({ usr: usr, pwd: pwd }),
      });
      var data = await res.json();
      if (res.ok) {
        window.location.href = redirect;
      } else {
        var excType = (data && data.exc_type) || "";
        if (excType === "AuthenticationError" || excType === "LoginError") {
          showError("Email/username atau password salah.");
        } else {
          showError("Terjadi kesalahan, silakan coba lagi.");
        }
        btn.disabled = false;
        btn.textContent = "Masuk ke Workspace →";
      }
    } catch (_) {
      showError("Tidak dapat terhubung ke server. Periksa koneksi Anda.");
      btn.disabled = false;
      btn.textContent = "Masuk ke Workspace →";
    }
  });
}());
</script>
</body>
</html>
```

- [ ] **Step 2: Verify file exists**

```bash
ls -la apps/vernon_tasks/vernon_tasks/www/login.html
wc -l apps/vernon_tasks/vernon_tasks/www/login.html
```

Expected: file exists, ~220+ lines.

- [ ] **Step 3: Commit**

```bash
git add apps/vernon_tasks/vernon_tasks/www/login.html
git commit -m "feat(login): 2-panel gradient mural login page override"
```

---

### Task 3: Verify in Browser

No automated test applicable for a full-page HTML override — verify manually.

- [ ] **Step 1: Clear Frappe template cache**

```bash
bench --site task.localhost clear-cache
```

- [ ] **Step 2: Open browser and verify layout**

Open `http://task.localhost:8080/login` while logged out.

Expected:
- Left panel: purple→pink gradient + grid pattern + feature list visible
- Right panel: white form with username + password fields
- No Frappe default blue login page

- [ ] **Step 3: Verify error state**

Submit empty form or wrong credentials.

Expected: red error box appears below password field with text "Email/username atau password salah."

- [ ] **Step 4: Verify successful login**

Submit valid credentials (Administrator / admin in dev mode).

Expected: redirects to `/m/work`.

- [ ] **Step 5: Verify redirect after login**

Visit `http://task.localhost:8080/login` while already logged in.

Expected: redirects immediately to `/m/work` (no login form shown).

- [ ] **Step 6: Verify responsive**

Resize browser below 768px.

Expected: left panel stacks above form, no horizontal scroll, no overflow.

- [ ] **Step 7: Final commit if any fixes made**

```bash
git add -p
git commit -m "fix(login): <describe any fix>"
```
