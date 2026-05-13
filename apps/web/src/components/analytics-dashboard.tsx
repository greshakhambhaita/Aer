import { trpc } from "@/utils/trpc";
import { Button } from "@Aer/ui/components/button";
import { Checkbox } from "@Aer/ui/components/checkbox";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

export default function AnalyticsDashboard() {
  const [expanded, setExpanded] = useState(false);

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery(trpc.analytics.getStats.queryOptions());

  const updateStatus = useMutation(
    trpc.todo.updateStatus.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries(trpc.analytics.getStats.queryKey());
        void queryClient.invalidateQueries(trpc.todo.getAll.queryKey());
      },
    })
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 rounded-full border-2 border-zinc-300 border-t-zinc-700 animate-spin" />
          <p className="text-sm text-zinc-400 tracking-wide">Loading analytics</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-red-500">Failed to load analytics</p>
      </div>
    );
  }

  const { needsAttention, highPriority, quickWins, aging, today, stats, delays } = data;

  return (
    <div className="min-h-screen bg-zinc-50 p-6 font-sans">
      <div className="max-w-2xl mx-auto space-y-3">

        {/* Header */}
        <div className="mb-6">
          <p className="text-xs uppercase tracking-widest text-zinc-400 mb-1">Dashboard</p>
          <h1 className="text-2xl font-semibold text-zinc-900 leading-tight">Analytics</h1>
        </div>

        {/* Stat row */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="On-time completion"
            value={`${stats.completionRate}%`}
            accent="green"
          />
          <StatCard
            label="Avg completion time"
            value={`${stats.avgCompletionTime}h`}
            accent="amber"
          />
        </div>

        {/* Needs Attention */}
        <Section title="Needs attention" badge={needsAttention.length} badgeVariant="red">
          {needsAttention.length === 0 ? (
            <EmptyState label="All clear for today" />
          ) : (
            <ul className="space-y-1">
              {needsAttention.map((t) => (
                <TaskRow
                  key={t.id}
                  text={t.text}
                  checked={t.status === "completed"}
                  onToggle={(checked) =>
                    updateStatus.mutate({
                      id: t.id,
                      status: checked ? "completed" : "created",
                    })
                  }
                />
              ))}
            </ul>
          )}
        </Section>

        {/* High Priority */}
        <Section title="Do these next" badge={highPriority.length} badgeVariant="orange">
          {highPriority.length === 0 ? (
            <EmptyState label="Nothing urgent" />
          ) : (
            <ul className="space-y-1">
              {highPriority.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-3 px-1 py-2 rounded-lg text-sm text-zinc-700 hover:bg-zinc-50 transition-colors duration-150"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
                  {t.text}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Today's Plan */}
        <Section title="Today's plan" badge={today.length} badgeVariant="blue">
          {today.length === 0 ? (
            <EmptyState label="Plan is empty" />
          ) : (
            <div className="flex flex-wrap gap-2">
              {today.map((t) => (
                <span
                  key={t.id}
                  className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100 transition-all duration-150 hover:bg-blue-100"
                >
                  {t.text}
                </span>
              ))}
            </div>
          )}
        </Section>

        {/* More Insights */}
        <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between px-5 py-4 text-left group hover:bg-zinc-50 transition-colors duration-150"
          >
            <span className="text-sm font-medium text-zinc-800">More insights</span>
            <svg
              className={`w-4 h-4 text-zinc-400 transition-transform duration-300 ease-in-out ${expanded ? "rotate-180" : "rotate-0"
                }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <div
            className={`transition-all duration-300 ease-in-out overflow-hidden ${expanded ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"
              }`}
          >
            <div className="px-5 pb-5 space-y-5 border-t border-zinc-100 pt-4">

              {/* Quick Wins */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-2">
                  Quick wins
                </p>
                {quickWins.length === 0 ? (
                  <EmptyState label="No quick wins available" />
                ) : (
                  <ul className="space-y-1">
                    {quickWins.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center gap-3 py-2 text-sm text-zinc-700 hover:text-zinc-900 transition-colors duration-150"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                        {t.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Aging Tasks */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-2">
                  Aging tasks
                </p>
                {aging.length === 0 ? (
                  <EmptyState label="No aging tasks" />
                ) : (
                  <ul className="space-y-2">
                    {aging.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center justify-between gap-3 py-2 text-sm text-zinc-700 group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                          <span className="truncate">{t.text}</span>
                        </div>
                        <Button
                          size="sm"
                          className="shrink-0 text-xs h-7 px-3 rounded-full bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 hover:text-red-700 transition-all duration-150 font-medium"
                        >
                          Complete
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Delay Frequency */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-2">
                  Delay frequency
                </p>
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-semibold text-zinc-900 font-mono tabular-nums">
                    {delays}
                  </span>
                  <span className="text-sm text-zinc-500">delayed tasks</span>
                  {delays > 0 && (
                    <span className="ml-auto inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100">
                      Needs review
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function Section({
  title,
  badge,
  badgeVariant = "zinc",
  children,
}: {
  title: string;
  badge?: number;
  badgeVariant?: "red" | "orange" | "blue" | "green" | "zinc";
  children: React.ReactNode;
}) {
  const badgeColors: Record<string, string> = {
    red: "bg-red-50 text-red-600 border-red-100",
    orange: "bg-orange-50 text-orange-600 border-orange-100",
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    green: "bg-green-50 text-green-600 border-green-100",
    zinc: "bg-zinc-100 text-zinc-500 border-zinc-200",
  };

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 px-5 py-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-medium text-zinc-800">{title}</h2>
        {badge !== undefined && badge > 0 && (
          <span
            className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-semibold border ${badgeColors[badgeVariant]}`}
          >
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function TaskRow({
  text,
  checked,
  onToggle,
}: {
  text: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <li className="flex items-center gap-3 px-1 py-2 rounded-lg hover:bg-zinc-50 transition-colors duration-150 group">
      <Checkbox
        checked={checked}
        onCheckedChange={(val) => onToggle(!!val)}
        className="transition-all duration-150"
      />
      <span
        className={`text-sm transition-all duration-200 ${checked ? "line-through text-zinc-400" : "text-zinc-700"
          }`}
      >
        {text}
      </span>
    </li>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "green" | "amber";
}) {
  const dot: Record<string, string> = {
    green: "bg-green-400",
    amber: "bg-amber-400",
  };

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 px-5 py-4 shadow-sm">
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`w-1.5 h-1.5 rounded-full ${dot[accent]}`} />
        <p className="text-xs text-zinc-400 leading-none">{label}</p>
      </div>
      <p className="text-2xl font-semibold text-zinc-900 font-mono tabular-nums">{value}</p>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <p className="text-xs text-zinc-400 py-2 italic">{label}</p>
  );
}