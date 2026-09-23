import {
  Line,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ActivityDaily } from "@/lib/types";
import { format, parseISO } from "date-fns";
import { useMemo, useState } from "react";

type SeriesName =
  | "Emails Sent"
  | "Connection Requests"
  | "Tasks Completed"
  | "Leads Touched";

interface ActivityChartProps {
  data: ActivityDaily[];
  title: string;
  description?: string;
  tasksCompletedByDate?: Record<string, number>;
  leadsTouchedByDate?: Record<string, number>;
  onDayClick?: (isoDateKey: string) => void;
}

export function ActivityChart({
  data,
  title,
  description,
  tasksCompletedByDate,
  leadsTouchedByDate,
  onDayClick,
}: ActivityChartProps) {
  const [hoveredSeries, setHoveredSeries] = useState<SeriesName | null>(null);

  const chartData = useMemo(() => {
    const byDate = new Map<
      string,
      {
        emailsSent: number;
        linkedinConnectionsSent: number;
        connectionAccepts: number;
      }
    >();

    for (const row of data) {
      const key = row.activityDate;
      const prev = byDate.get(key) ?? {
        emailsSent: 0,
        linkedinConnectionsSent: 0,
        connectionAccepts: 0,
      };
      byDate.set(key, {
        emailsSent: prev.emailsSent + (row.emailsSent || 0),
        linkedinConnectionsSent:
          prev.linkedinConnectionsSent + (row.linkedinConnectionsSent || 0),
        connectionAccepts: prev.connectionAccepts + (row.connectionAccepts || 0),
      });
    }

    // Make sure dates that only have tasks/leads-touched (no activities) still appear
    if (tasksCompletedByDate) {
      for (const key of Object.keys(tasksCompletedByDate)) {
        if (!byDate.has(key)) {
          byDate.set(key, {
            emailsSent: 0,
            linkedinConnectionsSent: 0,
            connectionAccepts: 0,
          });
        }
      }
    }
    if (leadsTouchedByDate) {
      for (const key of Object.keys(leadsTouchedByDate)) {
        if (!byDate.has(key)) {
          byDate.set(key, {
            emailsSent: 0,
            linkedinConnectionsSent: 0,
            connectionAccepts: 0,
          });
        }
      }
    }

    return Array.from(byDate.entries())
      .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
      .map(([activityDate, totals]) => ({
        isoDate: activityDate,
        date: format(parseISO(activityDate), "MMM dd"),
        "Emails Sent": totals.emailsSent,
        "Connection Requests": totals.linkedinConnectionsSent,
        "Tasks Completed": tasksCompletedByDate?.[activityDate] ?? 0,
        "Leads Touched": leadsTouchedByDate?.[activityDate] ?? 0,
      }));
  }, [data, tasksCompletedByDate, leadsTouchedByDate]);

  const showTaskSeries = !!tasksCompletedByDate;
  const showLeadSeries = !!leadsTouchedByDate;

  type DotProps = {
    cx?: number;
    cy?: number;
    payload?: Record<string, number | string | undefined>;
    index?: number;
  };

  const makeDot = (
    seriesName: SeriesName,
    fillVar: string,
    shape: "circle" | "rect" | "diamond" | "triangle",
  ) => ({ cx, cy, payload, index }: DotProps) => {
    if (typeof cx !== "number" || typeof cy !== "number") {
      return <circle key={`${seriesName}-empty-${index ?? "unknown"}`} cx={0} cy={0} r={0} fill="transparent" />;
    }
    const dotKey = `${seriesName}-${payload?.isoDate ?? index ?? `${cx}-${cy}`}`;
    const overlapEmailConn =
      seriesName === "Emails Sent" || seriesName === "Connection Requests"
        ? payload?.["Emails Sent"] === payload?.["Connection Requests"]
        : false;
    const offsetX =
      seriesName === "Emails Sent" && overlapEmailConn
        ? -4
        : seriesName === "Connection Requests" && overlapEmailConn
        ? 4
        : 0;

    const common = {
      fill: fillVar,
      stroke: "hsl(var(--background))",
      strokeWidth: 1.5,
      style: { cursor: onDayClick ? "pointer" : "default" } as React.CSSProperties,
      onMouseEnter: () => setHoveredSeries(seriesName),
      onMouseMove: () => setHoveredSeries(seriesName),
    };

    if (shape === "rect") {
      return <rect key={dotKey} {...common} x={cx - 3 + offsetX} y={cy - 3} width={6} height={6} rx={1} />;
    }
    if (shape === "diamond") {
      return (
        <polygon
          key={dotKey}
          {...common}
          points={`${cx + offsetX},${cy - 4} ${cx + 4 + offsetX},${cy} ${cx + offsetX},${cy + 4} ${cx - 4 + offsetX},${cy}`}
        />
      );
    }
    if (shape === "triangle") {
      return (
        <polygon
          key={dotKey}
          {...common}
          points={`${cx + offsetX},${cy - 4} ${cx + 4 + offsetX},${cy + 4} ${cx - 4 + offsetX},${cy + 4}`}
        />
      );
    }
    return <circle key={dotKey} {...common} cx={cx + offsetX} cy={cy} r={3} />;
  };

  const renderTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ name?: string; value?: number; color?: string; payload?: Record<string, unknown> }>;
    label?: string;
  }) => {
    if (!active || !payload || payload.length === 0) return null;

    const emailEntry = payload.find((p) => p?.name === "Emails Sent");
    const connectionEntry = payload.find((p) => p?.name === "Connection Requests");
    const isExactOverlap =
      emailEntry &&
      connectionEntry &&
      Number(emailEntry.value ?? 0) === Number(connectionEntry.value ?? 0);

    let entriesToShow = payload;
    if (hoveredSeries) {
      const focused = payload.find((p) => p?.name === hoveredSeries);
      if (focused) {
        if (
          isExactOverlap &&
          (focused.name === "Emails Sent" || focused.name === "Connection Requests")
        ) {
          entriesToShow = payload.filter(
            (p) => p.name === "Emails Sent" || p.name === "Connection Requests",
          );
        } else {
          entriesToShow = [focused];
        }
      }
    }

    return (
      <div
        className="rounded-md border px-3 py-2 shadow-sm"
        style={{
          backgroundColor: "hsl(var(--card))",
          borderColor: "hsl(var(--border))",
        }}
      >
        <div className="text-xs text-muted-foreground mb-1">{label}</div>
        <div className="space-y-1">
          {entriesToShow.map((entry) => (
            <div
              key={`${entry.name}-${entry.color}`}
              className="text-xs font-medium"
              style={{ color: entry.color || "hsl(var(--foreground))" }}
            >
              {entry.name}: {entry.value ?? 0}
            </div>
          ))}
        </div>
        {onDayClick ? (
          <div className="mt-2 pt-2 border-t text-[10px] text-muted-foreground">
            Click point for details
          </div>
        ) : null}
      </div>
    );
  };

  const handleChartClick = (state: unknown) => {
    if (!onDayClick) return;
    const activePayload = (state as { activePayload?: Array<{ payload?: { isoDate?: string } }> })?.activePayload;
    const isoDate = activePayload?.[0]?.payload?.isoDate;
    if (isoDate) onDayClick(isoDate);
  };

  return (
    <Card className="col-span-4">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="pl-2">
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              onClick={onDayClick ? handleChartClick : undefined}
              style={{ cursor: onDayClick ? "pointer" : "default" }}
            >
              <XAxis
                dataKey="date"
                stroke="#888888"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#888888"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${value}`}
              />
              <Tooltip
                shared
                content={renderTooltip}
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  borderColor: "hsl(var(--border))",
                  borderRadius: "var(--radius)",
                }}
                itemStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Legend wrapperStyle={{ paddingTop: "20px" }} />
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              <Line
                type="monotone"
                dataKey="Emails Sent"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={makeDot("Emails Sent", "hsl(var(--primary))", "circle")}
                activeDot={{ r: 5 }}
                onMouseEnter={() => setHoveredSeries("Emails Sent")}
                onMouseMove={() => setHoveredSeries("Emails Sent")}
                onMouseLeave={() => setHoveredSeries(null)}
              />
              <Line
                type="monotone"
                dataKey="Connection Requests"
                stroke="hsl(var(--chart-2))"
                strokeWidth={2}
                dot={makeDot("Connection Requests", "hsl(var(--chart-2))", "rect")}
                activeDot={{ r: 5 }}
                onMouseEnter={() => setHoveredSeries("Connection Requests")}
                onMouseMove={() => setHoveredSeries("Connection Requests")}
                onMouseLeave={() => setHoveredSeries(null)}
              />
              {showTaskSeries ? (
                <Line
                  type="monotone"
                  dataKey="Tasks Completed"
                  stroke="#10b981"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  dot={makeDot("Tasks Completed", "#10b981", "diamond")}
                  activeDot={{ r: 5 }}
                  onMouseEnter={() => setHoveredSeries("Tasks Completed")}
                  onMouseMove={() => setHoveredSeries("Tasks Completed")}
                  onMouseLeave={() => setHoveredSeries(null)}
                />
              ) : null}
              {showLeadSeries ? (
                <Line
                  type="monotone"
                  dataKey="Leads Touched"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="2 2"
                  dot={makeDot("Leads Touched", "#f59e0b", "triangle")}
                  activeDot={{ r: 5 }}
                  onMouseEnter={() => setHoveredSeries("Leads Touched")}
                  onMouseMove={() => setHoveredSeries("Leads Touched")}
                  onMouseLeave={() => setHoveredSeries(null)}
                />
              ) : null}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
