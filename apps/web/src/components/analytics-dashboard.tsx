import { useState } from "react";
import { trpc } from "@/utils/trpc";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@Aer/ui/components/button";
import { Card } from "@Aer/ui/components/card";
import { Checkbox } from "@Aer/ui/components/checkbox";

export default function AnalyticsDashboard() {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useQuery(trpc.analytics.getStats.queryOptions());

  if (isLoading) {
    return <div className="p-6 text-center">Loading analytics...</div>;
  }

  if (!data) {
    return <div className="p-6 text-center text-red-500">Error loading analytics</div>;
  }

  const {
    needsAttention,
    highPriority,
    quickWins,
    aging,
    today,
    stats,
    delays,
  } = data;

  return (
    <div className="p-6 space-y-6">
      {/* Needs Attention */}
      <Card className="p-4">
        <h2 className="font-semibold mb-2">Needs Attention Today</h2>
        {needsAttention.map((t) => (
          <div key={t.id} className="flex items-center gap-2">
            <Checkbox />
            <span>{t.text}</span>
          </div>
        ))}
      </Card>

      {/* High Priority */}
      <Card className="p-4">
        <h2 className="font-semibold mb-2">Do These Next</h2>
        {highPriority.map((t) => (
          <div key={t.id}>{t.text}</div>
        ))}
      </Card>

      {/* Delivery Performance */}
      <Card className="p-4">
        <h2 className="font-semibold mb-2">Delivery Performance</h2>
        <p>On-time completion: {stats.completionRate}%</p>
        <p>Avg completion time: {stats.avgCompletionTime}h</p>
      </Card>

      {/* Today's Plan */}
      <Card className="p-4">
        <h2 className="font-semibold mb-2">Today’s Plan</h2>
        <div className="flex gap-2">
          {today.map((t) => (
            <div
              key={t.id}
              className="px-2 py-1 bg-gray-200 rounded"
            >
              {t.text}
            </div>
          ))}
        </div>
      </Card>

      {/* More */}
      <Card className="p-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="font-semibold"
        >
          More Insights
        </button>

        {expanded && (
          <div className="mt-4 space-y-4">
            {/* Quick Wins */}
            <div>
              <h3 className="font-medium">Quick Wins</h3>
              {quickWins.map((t) => (
                <div key={t.id}>{t.text}</div>
              ))}
            </div>

            {/* Aging */}
            <div>
              <h3 className="font-medium">Aging Tasks</h3>
              {aging.map((t) => (
                <div key={t.id} className="flex justify-between">
                  <span>{t.text}</span>
                  <Button size="sm">Complete Now</Button>
                </div>
              ))}
            </div>

            {/* Delay */}
            <div>
              <h3 className="font-medium">Delay Frequency</h3>
              <p>{delays} delayed tasks</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}