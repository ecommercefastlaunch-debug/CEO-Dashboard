"use client";

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DayPoint } from "@/lib/reports";

const peso = (c: number) => `₱${Math.round(c / 100).toLocaleString("en-PH")}`;
const pesoAxis = (c: number) => {
  const v = c / 100;
  if (Math.abs(v) >= 1_000_000) return `₱${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `₱${(v / 1_000).toFixed(v >= 10_000 ? 0 : 1)}k`;
  return `₱${Math.round(v)}`;
};
const dayLabel = (day: string) =>
  new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

// Series names double as legend labels, as in the B.E.X chart.
const ORDER_VALUE = "Order value ₱";
const DELIVERED = "Delivered ₱";
const SPEND = "Ad spend";
const RTS = "RTS ₱";
const CANCELLED = "Cancelled ₱";
const ORDERS = "Orders";

/** Sales over time — delivered cash vs orders placed, ad spend and money lost to RTS/cancels, day by day. */
export function SalesChart({ points }: { points: DayPoint[] }) {
  const data = points.map((p) => ({
    label: dayLabel(p.day),
    [ORDER_VALUE]: p.orderedValue,
    [DELIVERED]: p.sales,
    [SPEND]: p.advertising,
    [RTS]: p.returnedValue,
    [CANCELLED]: p.cancelledValue,
    [ORDERS]: p.orders,
  }));
  const empty = points.every((p) => !p.sales && !p.advertising && !p.orders);

  if (empty) {
    return <div className="flex h-64 items-center justify-center text-[13px] text-text-faint">No orders, sales or ad spend in this period yet.</div>;
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 14, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-muted)" }} stroke="var(--border-strong)" minTickGap={24} />
          <YAxis yAxisId="peso" tick={{ fontSize: 11, fill: "var(--text-muted)" }} stroke="var(--border-strong)" width={52} tickFormatter={(v) => pesoAxis(Number(v))} />
          <YAxis yAxisId="orders" orientation="right" tick={{ fontSize: 11, fill: "var(--text-faint)" }} stroke="var(--border)" width={32} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 8, fontSize: 12, color: "var(--text)" }}
            cursor={{ fill: "var(--surface-2)", opacity: 0.5 }}
            itemSorter={(item) => -(Number(item.value) || 0)}
            formatter={(v, name) => [name === ORDERS ? Number(v).toLocaleString("en-PH") : peso(Number(v)), name]}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--text-muted)", paddingTop: 8 }} />
          <Bar yAxisId="orders" dataKey={ORDERS} fill="var(--border-strong)" fillOpacity={0.55} radius={[3, 3, 0, 0]} maxBarSize={22} />
          <Line yAxisId="peso" type="monotone" dataKey={SPEND} stroke="var(--spend)" strokeWidth={2} strokeDasharray="5 4" dot={false} />
          <Line yAxisId="peso" type="monotone" dataKey={CANCELLED} stroke="var(--critical)" strokeWidth={2} dot={false} />
          <Line yAxisId="peso" type="monotone" dataKey={DELIVERED} stroke="var(--healthy)" strokeWidth={2.25} dot={false} />
          <Line yAxisId="peso" type="monotone" dataKey={ORDER_VALUE} stroke="var(--gold)" strokeWidth={2.25} dot={false} />
          <Line yAxisId="peso" type="monotone" dataKey={RTS} stroke="var(--rts)" strokeWidth={2} strokeDasharray="5 4" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
