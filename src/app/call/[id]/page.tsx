"use client";

import { use } from "react";
import dynamic from "next/dynamic";
import { RequireAuth } from "@/components/dashboard/RequireAuth";

// LiveKit uses browser-only APIs (WebRTC), so the room renders on the client only.
const CallRoom = dynamic(() => import("@/components/call/CallRoom").then((m) => m.CallRoom), { ssr: false });

export default function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequireAuth next={`/call/${id}`}>
      <CallRoom callId={id} />
    </RequireAuth>
  );
}
