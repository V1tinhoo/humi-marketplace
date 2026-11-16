"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

const KEY = "humi.betabar.dismissed";

export function BetaBar() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(sessionStorage.getItem(KEY) !== "1");
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="relative bg-plum px-10 py-2 text-center text-xs font-medium text-white sm:text-[13px]">
      <span className="mr-2 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider">Beta preview</span>
      Profiles, bookings and payments on this site are demonstrations. No real sessions or charges.
      <button
        onClick={() => {
          setVisible(false);
          try {
            sessionStorage.setItem(KEY, "1");
          } catch {}
        }}
        className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"
        aria-label="Dismiss beta notice"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
