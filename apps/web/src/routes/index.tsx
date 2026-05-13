import { trpc } from "@/utils/trpc";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import AnalyticsDashboard from "../components/analytics-dashboard";

export const Route = createFileRoute("/")({
  component: RouteComponent,
  beforeLoad: async ({ context }) => {
    if (!context.session) {
      redirect({
        to: "/login",
        throw: true,
      });
    }
  },
});

function RouteComponent() {
  const { session } = Route.useRouteContext();

  const privateData = useQuery(trpc.privateData.queryOptions());

  return (
    <div>
      <AnalyticsDashboard />
    </div>
  );
}
