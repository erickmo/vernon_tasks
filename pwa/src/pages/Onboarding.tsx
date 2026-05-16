import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { t } from "../i18n";

const SLIDES = [
  { title: t("onboarding.welcome.title"), body: t("onboarding.welcome.body"), cta: "Lanjut" },
  { title: t("onboarding.anywhere.title"), body: t("onboarding.anywhere.body"), cta: "Lanjut" },
  { title: t("onboarding.start.title"), body: "", cta: t("onboarding.start.cta") },
];

export function Onboarding() {
  const [i, setI] = useState(0);
  const nav = useNavigate();
  const slide = SLIDES[i];
  const last = i === SLIDES.length - 1;

  function next() {
    if (last) {
      localStorage.setItem("vt_pwa_onboarded", "1");
      nav("/m/work", { replace: true });
    } else {
      setI(i + 1);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--vt-bg)",
        padding: 24,
        paddingTop: "calc(var(--safe-top) + 24px)",
      }}
    >
      {/* Slide card */}
      <div style={{ flex: 1, display: "grid", placeItems: "center" }}>
        <div
          style={{
            background: "var(--vt-surface)",
            borderRadius: 24,
            border: "1px solid var(--vt-border)",
            padding: "40px 28px",
            textAlign: "center",
            width: "100%",
            maxWidth: 360,
          }}
        >
          <h1 style={{ color: "var(--vt-primary-dark)", margin: "0 0 16px", fontSize: 26, fontWeight: 800 }}>
            {slide.title}
          </h1>
          {slide.body && (
            <p style={{ color: "var(--vt-text-muted)", maxWidth: 280, margin: "0 auto", lineHeight: 1.6 }}>
              {slide.body}
            </p>
          )}
        </div>
      </div>

      {/* Dot indicators */}
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 24 }}>
        {SLIDES.map((_, idx) => (
          <span
            key={idx}
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: idx === i ? "var(--vt-primary)" : "var(--vt-border)",
              transition: "background 0.2s",
            }}
          />
        ))}
      </div>

      {/* CTA button */}
      <button
        onClick={next}
        style={{
          padding: 16,
          background: "#9561ab",
          color: "white",
          border: 0,
          borderRadius: "var(--vt-radius)",
          fontWeight: 700,
          fontSize: 16,
          cursor: "pointer",
          boxShadow: "0 4px 16px rgba(149,97,171,0.4)",
        }}
      >
        {slide.cta}
      </button>
    </div>
  );
}
