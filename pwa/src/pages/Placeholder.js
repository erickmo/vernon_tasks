import { jsx as _jsx } from "react/jsx-runtime";
import { EmptyState } from "../components/EmptyState";
import { t } from "../i18n";
export function Placeholder({ title }) {
    return _jsx(EmptyState, { title: title, body: t("common.coming_soon") });
}
