import { Link } from "react-router-dom";
import type { ProjectRow as ProjectRowData } from "../../../../api/dashboard";
import { fmtDateShort, TOKENS } from "./shared";

interface Props {
  data: ProjectRowData;
}

export function ProjectRow({ data }: Props) {
  return (
    <Link
      to={`/m/project/${data.id}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "11px 14px",
        background: TOKENS.CARD,
        borderRadius: 10,
        boxShadow: TOKENS.SHADOW,
        textDecoration: "none",
        color: TOKENS.TEXT,
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: TOKENS.TEXT,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {data.name}
        </div>
        <div style={{ fontSize: 11, color: TOKENS.TEXT2, marginTop: 1 }}>
          {data.pct_done.toFixed(0)}% · {data.my_open_tasks} task saya
          {data.next_milestone && ` · MS ${fmtDateShort(data.next_milestone)}`}
        </div>
      </span>
    </Link>
  );
}
