"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatINR, formatNumberIN } from "@/lib/money";
import { formatDateShort } from "@/lib/dates";
import { LOAN_STATUS_LABELS } from "@/lib/constants";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "#0f766e",
  COMPLETED: "#2563eb",
  DRAFT: "#94a3b8",
  WRITTEN_OFF: "#d97706",
  CANCELLED: "#64748b",
};

export function CollectionTrendChart({ data }: { data: { date: string; amount: number }[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="collectionFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0f766e" stopOpacity={0.28} />
              <stop offset="95%" stopColor="#0f766e" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(value: string) => formatDateShort(value)}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={18}
          />
          <YAxis
            tickFormatter={(value: number) => (value >= 1000 ? `${Math.round(value / 1000)}k` : String(value))}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            width={42}
          />
          <Tooltip
            formatter={(value) => [formatINR(Number(value ?? 0)), "Collected"]}
            labelFormatter={(label) => formatDateShort(String(label))}
            contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", fontSize: 12, background: "var(--card)" }}
          />
          <Area type="monotone" dataKey="amount" stroke="#0f766e" strokeWidth={2} fill="url(#collectionFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LoanStatusChart({ statusCounts }: { statusCounts: Record<string, number> }) {
  const data = Object.entries(statusCounts)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => ({ status, label: LOAN_STATUS_LABELS[status] ?? status, count }));

  if (!data.length) {
    return <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">No loans yet.</div>;
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="count" nameKey="label" innerRadius={52} outerRadius={78} paddingAngle={2} strokeWidth={0}>
            {data.map((entry) => (
              <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "#94a3b8"} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, name) => [`${formatNumberIN(Number(value ?? 0), 0)} loans`, String(name)]}
            contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", fontSize: 12, background: "var(--card)" }}
          />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            iconSize={8}
            formatter={(value) => <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RepaymentCompositionChart({
  data,
}: {
  data: { contractualRepayment: number; netDisbursed: number; lifetimeCollected: number; expectedMargin: number };
}) {
  const rows = [
    { name: "Contractual repayment", value: data.contractualRepayment, fill: "#0f766e" },
    { name: "Net cash disbursed", value: data.netDisbursed, fill: "#334155" },
    { name: "Cash collected (all time)", value: data.lifetimeCollected, fill: "#2563eb" },
    { name: "Expected gross margin", value: data.expectedMargin, fill: "#14b8a6" },
  ];

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={(value: number) => (value >= 1000 ? `${Math.round(value / 1000)}k` : String(value))}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={132}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(value) => [formatINR(Number(value ?? 0)), "Amount"]}
            contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", fontSize: 12, background: "var(--card)" }}
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18}>
            {rows.map((row) => (
              <Cell key={row.name} fill={row.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
