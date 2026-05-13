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
