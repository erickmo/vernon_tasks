import { LineChart, Line, ResponsiveContainer } from 'recharts';

export function Sparkline({ data, height = 32 }: { data: number[]; height?: number }) {
  const points = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points}>
        <Line type="monotone" dataKey="v" stroke="currentColor" strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
