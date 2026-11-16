"use client";

import { RequireAuth } from "@/components/dashboard/RequireAuth";
import { HostDashboard } from "@/components/dashboard/HostDashboard";
import { LiveHostDashboard } from "@/components/dashboard/LiveHostDashboard";
import { useAuth } from "@/lib/auth";

export default function DashboardPage() {
  return (
    <RequireAuth role="host" next="/dashboard">
      <DashboardSwitch />
    </RequireAuth>
  );
}

function DashboardSwitch() {
  const { mode } = useAuth();
  return mode === "supabase" ? <LiveHostDashboard /> : <HostDashboard />;
}
