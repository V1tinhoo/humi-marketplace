"use client";

import { useEffect, useState } from "react";
import { Ban, Flag, Heart, Share2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReportButton } from "@/components/safety/ReportButton";
import { useT } from "@/i18n/client";

export function ProfileActions({ name, hostId, live = false }: { name: string; hostId?: string; live?: boolean }) {
  const tr = useT();
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setToast(tr("Profile link copied"));
    } catch {
      setToast(tr("Couldn't copy the link"));
    }
  };

  return (
    <>
      <div className="flex gap-2">
        <IconBtn label={saved ? tr("Remove from saved") : tr("Save profile")} onClick={() => { setSaved(!saved); setToast(saved ? tr("Removed from saved") : tr("{name} saved (demo)", { name })); }}>
          <Heart className={cn("size-4 transition", saved && "fill-rose text-rose")} />
        </IconBtn>
        <IconBtn label={tr("Share profile")} onClick={share}>
          <Share2 className="size-4" />
        </IconBtn>
        {live && hostId ? (
          <ReportButton variant="icon" target={{ hostId }} name={name} />
        ) : (
          <IconBtn label={tr("Report or block")} onClick={() => setReportOpen(true)}>
            <Flag className="size-4" />
          </IconBtn>
        )}
      </div>

      {toast && (
        <div role="status" className="fixed bottom-24 left-1/2 z-[70] -translate-x-1/2 animate-fade-up rounded-full bg-plum px-5 py-2.5 text-sm font-medium text-white shadow-lift lg:bottom-8">
          {toast}
        </div>
      )}

      {reportOpen && (
        <div className="fixed inset-0 z-[80] grid place-items-center p-4">
          <div className="absolute inset-0 bg-plum-deep/40 backdrop-blur-sm" onClick={() => setReportOpen(false)} />
          <div role="dialog" aria-modal aria-labelledby="report-title" className="relative w-full max-w-md animate-fade-up rounded-[1.5rem] bg-white p-6 shadow-lift">
            <button onClick={() => setReportOpen(false)} className="absolute right-4 top-4 grid size-8 place-items-center rounded-full hover:bg-lilac" aria-label={tr("Close")}>
              <X className="size-4" />
            </button>
            <h2 id="report-title" className="text-lg font-bold">{tr("Report or block {name}", { name })}</h2>
            <p className="mt-2 text-sm text-plum-soft">
              {tr("In the live product, reports go to our trust & safety team and blocking hides you from each other immediately. In this beta preview, these actions are not sent anywhere.")}
            </p>
            <div className="mt-5 grid gap-2">
              <button onClick={() => { setReportOpen(false); setToast(tr("Report recorded (demo only)")); }} className="flex items-center gap-3 rounded-xl bg-cream p-3 text-left text-sm font-semibold ring-1 ring-line hover:ring-lavender">
                <Flag className="size-4" /> {tr("Report this profile")}
              </button>
              <button onClick={() => { setReportOpen(false); setToast(tr("{name} blocked (demo only)", { name })); }} className="flex items-center gap-3 rounded-xl bg-cream p-3 text-left text-sm font-semibold ring-1 ring-line hover:ring-lavender">
                <Ban className="size-4" /> {tr("Block {name}", { name })}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="grid size-10 place-items-center rounded-full bg-white text-plum ring-1 ring-line transition hover:-translate-y-0.5 hover:ring-lavender">
      {children}
    </button>
  );
}
