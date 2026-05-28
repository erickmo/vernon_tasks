import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMeProgress } from "../../../api/dashboard";
import { Skeleton } from "../../../components/Skeleton";
import { EmptyState } from "../../../components/EmptyState";
import { logEvent } from "../../../telemetry";
import { VelocityStrip } from "./components/VelocityStrip";
import { SprintCommitmentCard } from "./components/SprintCommitmentCard";
import { WorkloadChips } from "./components/WorkloadChips";
import { NextActionsList } from "./components/NextActionsList";
import { TOKENS } from "./components/shared";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: TOKENS.TEXT3,
        textTransform: "uppercase",
        letterSpacing: "0.10em",
        margin: "0 0 8px",
      }}
    >
      {children}
    </p>
  );
}

export function MeTab() {
  useEffect(() => {
    logEvent("dashboard_tab_view", { tab: "me" });
  }, []);

  const q = useQuery({
    queryKey: ["dashboard-me-progress"],
    queryFn: fetchMeProgress,
    staleTime: 60_000,
  });

  if (q.isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Skeleton height={70} />
        <Skeleton height={100} />
        <Skeleton height={80} />
        <Skeleton height={200} />
      </div>
    );
  }

  if (q.isError || !q.data) {
    return (
      <EmptyState
        title="Gagal memuat ringkasan saya"
        cta={{ label: "Coba lagi", onClick: () => q.refetch() }}
      />
    );
  }

  const data = q.data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <SectionLabel>Velocity</SectionLabel>
      <VelocityStrip weeks={data.velocity} delta={data.velocity_delta} />

      <SectionLabel>Sprint Aktif</SectionLabel>
      {data.sprint ? (
        <SprintCommitmentCard sprint={data.sprint} />
      ) : (
        <EmptyState title="Belum ada sprint aktif" body="Sprint akan muncul saat tim memulai." />
      )}

      <SectionLabel>Beban Kerja</SectionLabel>
      <WorkloadChips workload={data.workload} />

      <SectionLabel>Tindakan Berikutnya</SectionLabel>
      <NextActionsList items={data.next_actions} />
    </div>
  );
}
