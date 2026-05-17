import { EmptyState } from "../../components/EmptyState";
import { t } from "../../i18n";

export function Placeholder({ title }: { title: string }) {
  return <EmptyState title={title} body={t("common.coming_soon")} />;
}
