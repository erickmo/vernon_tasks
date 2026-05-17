import { PageLayout } from "../layouts/PageLayout";
import { EmptyState } from "../../components/EmptyState";

export function ComingSoon({ domain }: { domain: string }) {
  return (
    <PageLayout title={domain}>
      <EmptyState title={`${domain} — coming soon`} description="This module ships in a later phase." />
    </PageLayout>
  );
}
