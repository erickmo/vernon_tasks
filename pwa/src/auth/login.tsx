import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { login, probeSession, type LoginBranding } from "./session";
import { t } from "../i18n";

const DEFAULT_BRANDING: LoginBranding = {
  headline: "Kelola tugas tim dengan lebih cerdas.",
  subtext:
    "Sprint, kanban, dan analitik dalam satu tempat — dirancang untuk tim yang bergerak cepat.",
};

const FOCUS_RING = "0 0 0 2px rgba(124,77,171,0.5)";

const S = {
  root: {
    height: "100svh",
    display: "flex",
  } as React.CSSProperties,

  left: {
    flex: "3 0 0",
    background: "linear-gradient(145deg, #1e0a3c 0%, #3d1f6e 50%, #5a2d8c 100%)",
    display: "flex",
    flexDirection: "column" as const,
    justifyContent: "space-between",
    padding: "48px 52px",
    position: "relative" as const,
    overflow: "hidden",
  },

  leftTop: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  leftLogo: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.15)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    color: "#fff",
  },
  leftBrand: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: "-0.2px",
  },

  leftCenter: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    justifyContent: "center",
    paddingBottom: 40,
  },
  leftHeadline: {
    color: "#fff",
    fontSize: 32,
    fontWeight: 700,
    lineHeight: 1.25,
    letterSpacing: "-0.5px",
    margin: "0 0 16px",
    maxWidth: 360,
  },
  leftSub: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 14,
    lineHeight: 1.6,
    maxWidth: 320,
    margin: 0,
  },

  leftStats: {
    display: "flex",
    gap: 32,
  },
  stat: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 3,
  },
  statNum: {
    color: "#fff",
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: "-0.5px",
  },
  statLabel: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: "0.3px",
  },

  // decorative blobs
  blob1: {
    position: "absolute" as const,
    top: -80,
    right: -80,
    width: 300,
    height: 300,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.04)",
    pointerEvents: "none" as const,
  },
  blob2: {
    position: "absolute" as const,
    bottom: -60,
    right: 60,
    width: 200,
    height: 200,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.03)",
    pointerEvents: "none" as const,
  },

  // Right panel
  right: {
    flex: "2 0 0",
    background: "var(--vt-bg)",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    padding: "40px 48px",
    borderLeft: "1px solid var(--vt-border)",
  },

  formWrap: {
    width: "100%",
    maxWidth: 320,
  },

  formTitle: {
    color: "var(--vt-text)",
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: "-0.3px",
    margin: "0 0 6px",
  },
  formSub: {
    color: "var(--vt-text-muted)",
    fontSize: 13,
    margin: "0 0 28px",
  },

  fieldWrap: {
    marginBottom: 14,
  },
  label: {
    display: "block",
    color: "var(--vt-text-muted)",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.4px",
    textTransform: "uppercase" as const,
    marginBottom: 5,
  },
  input: {
    display: "block",
    width: "100%",
    background: "var(--vt-bg)",
    border: "1px solid var(--vt-border)",
    borderRadius: "var(--vt-radius-sm)",
    padding: "9px 12px",
    color: "var(--vt-text)",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box" as const,
    transition: "border-color 0.15s",
  },
  errorBox: {
    background: "rgba(220,38,38,0.06)",
    border: "1px solid rgba(220,38,38,0.2)",
    borderRadius: "var(--vt-radius-sm)",
    padding: "8px 12px",
    marginBottom: 14,
    color: "var(--vt-danger)",
    fontSize: 12,
  },
  button: {
    width: "100%",
    background: "var(--vt-primary)",
    color: "white",
    border: "none",
    borderRadius: "var(--vt-radius-sm)",
    padding: "10px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    letterSpacing: "0.2px",
    marginTop: 6,
    transition: "opacity 0.15s",
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: "not-allowed" as const,
  },
  footer: {
    color: "var(--vt-text-muted)",
    fontSize: 11,
    marginTop: 24,
    textAlign: "center" as const,
  },
};

export function LoginPage() {
  const [usr, setUsr] = useState(() => localStorage.getItem("vt_last_user") ?? "Administrator");
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [branding, setBranding] = useState<LoginBranding>(DEFAULT_BRANDING);
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") ?? "/m/dashboard";

  useEffect(() => {
    probeSession().then((s) => {
      if (s.login_branding) setBranding(s.login_branding);
    }).catch(() => {});
  }, []);

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
      setErr(t("login.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={S.root}>
      {/* ── Left panel ── */}
      <div style={S.left}>
        <div style={S.blob1} aria-hidden="true" />
        <div style={S.blob2} aria-hidden="true" />

        <div style={S.leftTop}>
          <div style={S.leftLogo}>◆</div>
          <span style={S.leftBrand}>Vernon Tasks</span>
        </div>

        <div style={S.leftCenter}>
          <h2 style={S.leftHeadline}>{branding.headline}</h2>
          <p style={S.leftSub}>{branding.subtext}</p>
        </div>

        <div style={S.leftStats}>
          <div style={S.stat}>
            <span style={S.statNum}>Sprint</span>
            <span style={S.statLabel}>Tracking</span>
          </div>
          <div style={S.stat}>
            <span style={S.statNum}>Kanban</span>
            <span style={S.statLabel}>Visual board</span>
          </div>
          <div style={S.stat}>
            <span style={S.statNum}>Analitik</span>
            <span style={S.statLabel}>Real-time</span>
          </div>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={S.right}>
        <div style={S.formWrap}>
          <h1 style={S.formTitle}>Masuk</h1>
          <p style={S.formSub}>Masukkan kredensial akun Anda</p>

          <form onSubmit={onSubmit} noValidate>
            <div style={S.fieldWrap}>
              <label htmlFor="vt-usr" style={S.label}>{t("login.username")}</label>
              <input
                id="vt-usr"
                style={{
                  ...S.input,
                  boxShadow: focusedId === "vt-usr" ? FOCUS_RING : undefined,
                  borderColor: focusedId === "vt-usr" ? "var(--vt-primary)" : undefined,
                }}
                value={usr}
                onChange={(e) => setUsr(e.target.value)}
                onFocus={() => setFocusedId("vt-usr")}
                onBlur={() => setFocusedId(null)}
                autoComplete="username"
                required
                autoCapitalize="none"
              />
            </div>
            <div style={{ ...S.fieldWrap, marginBottom: 20 }}>
              <label htmlFor="vt-pwd" style={S.label}>{t("login.password")}</label>
              <input
                id="vt-pwd"
                type="password"
                style={{
                  ...S.input,
                  boxShadow: focusedId === "vt-pwd" ? FOCUS_RING : undefined,
                  borderColor: focusedId === "vt-pwd" ? "var(--vt-primary)" : undefined,
                }}
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                onFocus={() => setFocusedId("vt-pwd")}
                onBlur={() => setFocusedId(null)}
                autoComplete="current-password"
                required
              />
            </div>

            {err && <div role="alert" style={S.errorBox}>{err}</div>}

            <button
              type="submit"
              disabled={busy}
              style={{ ...S.button, ...(busy ? S.buttonDisabled : {}) }}
            >
              {busy ? t("login.processing") : t("login.submit")}
            </button>
          </form>

          <p style={S.footer}>{t("login.footer")}</p>
        </div>
      </div>
    </div>
  );
}
