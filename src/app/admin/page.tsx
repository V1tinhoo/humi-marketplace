"use client";

import { RequireAuth } from "@/components/dashboard/RequireAuth";
import { AdminPanel } from "@/components/admin/AdminPanel";

/** HUMI administration. Access is checked in the database (is_admin), not just here. */
export default function AdminPage() {
  return (
    <RequireAuth next="/admin">
      <AdminPanel />
    </RequireAuth>
  );
}
