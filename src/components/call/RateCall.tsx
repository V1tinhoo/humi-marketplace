"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Star } from "lucide-react";
import { FormError } from "@/components/ui/FormError";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const LABELS = ["", "Poor", "Not great", "Okay", "Good", "Wonderful"];

/**
 * Shown when a call ends. Guests rate the host (public review on the profile);
 * hosts rate the guest (private — only HUMI's team sees it).
 */
export function RateCall({ callId, name, isCustomer }: { callId: string; name: string; isCustomer: boolean }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"loading" | "idle" | "saving" | "done">("loading");
  const [error, setError] = useState<string | null>(null);

  // Already rated? Show it (and allow changing it).
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return setState("idle");
    supabase
      .rpc("my_call_rating", { p_call_id: callId })
      .then(({ data }) => {
        const row = data?.[0];
        if (row) {
          setRating(row.rating);
          setComment(row.comment ?? "");
          setState("done");
        } else setState("idle");
      });
  }, [callId]);

  const submit = async () => {
    if (!rating) return setError("Choose from 1 to 5 stars.");
    setError(null);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return setError("Ratings aren’t available right now.");
    setState("saving");
    const { error: err } = await supabase.rpc("rate_call", {
      p_call_id: callId,
      p_rating: rating,
      p_comment: comment.trim() || null,
    });
    if (err) {
      setError(err.message);
      setState("idle");
    } else setState("done");
  };

  if (state === "loading") return <div className="mt-6 h-40 rounded-[var(--radius-card)] skeleton" />;

  if (state === "done") {
    return (
      <div className="mt-6 rounded-[var(--radius-card)] bg-white p-6 ring-1 ring-line">
        <CheckCircle2 className="mx-auto size-8 text-online" />
        <p className="mt-2 font-bold">Thanks for your rating!</p>
        <Stars value={rating} className="mt-2 justify-center" small />
        <button onClick={() => setState("idle")} className="mt-3 text-sm font-semibold text-plum-soft underline-offset-4 hover:text-plum hover:underline">
          Change rating
        </button>
      </div>
    );
  }

  const shown = hover || rating;
  return (
    <div className="mt-6 rounded-[var(--radius-card)] bg-white p-6 text-left ring-1 ring-line">
      <p className="text-center font-bold">How was your conversation with {name}?</p>
      <p className="mt-0.5 text-center text-xs text-plum-soft">
        {isCustomer ? "Your review appears on their profile with your first name." : "Private — only the HUMI team sees ratings of guests."}
      </p>

      <div className="mt-4 flex justify-center gap-1" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            className="rounded-full p-1 transition hover:scale-110"
          >
            <Star className={cn("size-9", n <= shown ? "fill-[#f5b942] text-[#f5b942]" : "text-line")} />
          </button>
        ))}
      </div>
      <p className="h-5 text-center text-sm font-medium text-plum-soft">{LABELS[shown]}</p>

      <textarea
        rows={3}
        maxLength={1000}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={isCustomer ? "Tell others what the conversation was like (optional)" : "Anything the team should know? (optional)"}
        className="mt-3 w-full rounded-xl bg-cream p-3 text-sm ring-1 ring-line outline-none focus:ring-2 focus:ring-lavender"
      />
      <FormError message={error} className="mt-2" />
      <button
        type="button"
        onClick={submit}
        disabled={state === "saving" || !rating}
        className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-plum text-[15px] font-semibold text-white transition hover:bg-plum-deep disabled:opacity-50"
      >
        {state === "saving" && <Loader2 className="size-4 animate-spin" />}
        Send rating
      </button>
    </div>
  );
}

function Stars({ value, className, small }: { value: number; className?: string; small?: boolean }) {
  return (
    <div className={cn("flex gap-0.5", className)} aria-label={`${value} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn(small ? "size-5" : "size-7", n <= value ? "fill-[#f5b942] text-[#f5b942]" : "text-line")} />
      ))}
    </div>
  );
}
