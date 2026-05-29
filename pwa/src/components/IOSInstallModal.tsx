import { t } from "../i18n";
import { Modal } from "./ui/Modal";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function IOSInstallModal({ open, onClose }: Props) {
  return (
    <Modal open={open} onClose={onClose} variant="center" zIndex={110} labelledBy="ios-install-title">
      <div
        style={{
          background: "var(--vt-bg)",
          color: "var(--vt-text)",
          padding: 24,
          borderRadius: 16,
          maxWidth: 420,
          width: "100%",
        }}
      >
        <h3 id="ios-install-title" style={{ marginTop: 0 }}>{t("install.ios.title")}</h3>
        <ol style={{ paddingLeft: 20, lineHeight: 1.6 }}>
          <li>{t("install.ios.step1")}</li>
          <li>{t("install.ios.step2")}</li>
          <li>{t("install.ios.step3")}</li>
        </ol>
        <button
          onClick={onClose}
          style={{
            width: "100%",
            padding: 12,
            marginTop: 12,
            background: "var(--vt-primary)",
            color: "var(--vt-primary-contrast)",
            border: 0,
            borderRadius: "var(--vt-radius)",
          }}
        >
          {t("install.ios.close")}
        </button>
      </div>
    </Modal>
  );
}
