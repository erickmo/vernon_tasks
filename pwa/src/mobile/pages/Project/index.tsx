import { useState } from "react";
import { useMediaQuery } from "../../../hooks/useMediaQuery";
import { ProjectSidebar } from "./ProjectSidebar";
import { ProjectTaskPanel } from "./ProjectTaskPanel";

type MobilePanel = "sidebar" | "tasks";

export function ProjectPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("sidebar");
  const isDesktop = useMediaQuery(768);

  function handleSelect(id: string, title: string) {
    setSelectedId(id);
    setSelectedTitle(title);
    setMobilePanel("tasks");
  }

  const showSidebar = isDesktop || mobilePanel === "sidebar";
  const showTasks = isDesktop || mobilePanel === "tasks";

  return (
    <div style={{
      display: "flex", height: "100%", minHeight: "100vh",
      background: "#f1f5f9", overflow: "hidden",
    }}>
      {showSidebar && (
        <ProjectSidebar
          selectedId={selectedId}
          onSelect={handleSelect}
        />
      )}
      {showTasks && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          {!isDesktop && (
            <button
              onClick={() => setMobilePanel("sidebar")}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "10px 14px", background: "#ffffff",
                border: "none", borderBottom: "1px solid #e8edf3",
                fontSize: 13, fontWeight: 600, color: "#7c4dab",
                cursor: "pointer", textAlign: "left" as const, width: "100%",
              }}
            >
              ← Kembali
            </button>
          )}
          <ProjectTaskPanel projectId={selectedId} projectTitle={selectedTitle} />
        </div>
      )}
    </div>
  );
}
