import { useState } from "react";
import type { LeaderboardRow } from "../api/types";

const MEDAL_CLASS: Record<number, string> = {
  1: "medal--gold",
  2: "medal--silver",
  3: "medal--bronze",
};

interface Props {
  rows: LeaderboardRow[];
}

export function LeaderboardTable({ rows }: Props) {
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = [...rows].sort((a, b) =>
    sortAsc ? a.points - b.points : b.points - a.points
  );

  return (
    <table className="leaderboard-table">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Member</th>
          <th>
            <button onClick={() => setSortAsc((v) => !v)}>
              Points {sortAsc ? "▲" : "▼"}
            </button>
          </th>
          <th>Tasks Done</th>
          <th>Streak</th>
          <th>Avg Quality</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => (
          <tr key={row.user}>
            <td>
              {MEDAL_CLASS[row.rank] ? (
                <span className={`medal ${MEDAL_CLASS[row.rank]}`}>{row.rank}</span>
              ) : (
                row.rank
              )}
            </td>
            <td>{row.full_name}</td>
            <td>{row.points}</td>
            <td>{row.tasks_completed}</td>
            <td>{row.streak_days}d</td>
            <td>{row.avg_quality.toFixed(1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
