"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@livekit/components-react";
import { Loader2, SendHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type CallChatMessage = { id: string; text: string; at: number; mine: boolean; name: string };

const storageKey = (callId: string) => `humi:call-chat:${callId}`;

function load(callId: string): CallChatMessage[] {
  try {
    const raw = sessionStorage.getItem(storageKey(callId));
    return raw ? (JSON.parse(raw) as CallChatMessage[]) : [];
  } catch {
    return [];
  }
}

/**
 * In-call chat history. Lives in the call screen (not in the panel), so closing the panel
 * never loses messages, and a copy is kept in this tab so a page refresh doesn't wipe it.
 */
export function useCallChat(callId: string) {
  const { send, chatMessages, isSending } = useChat();
  const [saved] = useState(() => (typeof window === "undefined" ? [] : load(callId)));

  const messages = useMemo(() => {
    const live: CallChatMessage[] = chatMessages.map((m) => ({
      id: m.id,
      text: m.message,
      at: m.timestamp,
      mine: Boolean(m.from?.isLocal),
      name: m.from?.name || "Guest",
    }));
    const seen = new Set(live.map((m) => m.id));
    return [...saved.filter((m) => !seen.has(m.id)), ...live].sort((a, b) => a.at - b.at);
  }, [saved, chatMessages]);

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey(callId), JSON.stringify(messages.slice(-200)));
    } catch {
      /* storage unavailable — history still lives for the call */
    }
  }, [callId, messages]);

  return { messages, send, isSending };
}

export function CallChatPanel({
  messages,
  send,
  isSending,
  onClose,
  className,
}: ReturnType<typeof useCallChat> & { onClose: () => void; className?: string }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keep the newest message in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const submit = async () => {
    const msg = text.trim();
    if (!msg || isSending) return;
    setError(null);
    try {
      await send(msg);
      setText("");
    } catch {
      setError("Message not sent. Check your connection and try again.");
    }
  };

  return (
    <aside className={cn("flex flex-col overflow-hidden rounded-2xl bg-[#261e36]", className)}>
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
        <p className="font-semibold">In-call messages</p>
        <button onClick={onClose} className="grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label="Close chat">
          <X className="size-4" />
        </button>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3" aria-live="polite">
        <p className="rounded-xl bg-white/5 px-3 py-2 text-xs text-white/60">
          Messages are only visible during the call. Keep personal contact details and payments on HUMI.
        </p>
        {messages.length === 0 && <p className="pt-6 text-center text-sm text-white/45">No messages yet. Say hi!</p>}
        {messages.map((m, i) => {
          const grouped = i > 0 && messages[i - 1].mine === m.mine && m.at - messages[i - 1].at < 60_000;
          return (
            <div key={m.id} className={cn("flex flex-col", m.mine ? "items-end" : "items-start", grouped && "-mt-2")}>
              {!grouped && (
                <p className="mb-1 px-1 text-[11px] text-white/50">
                  <span className="font-semibold text-white/75">{m.mine ? "You" : m.name}</span>{" "}
                  {new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
              <p
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm",
                  m.mine ? "rounded-br-md bg-lavender text-plum-deep" : "rounded-bl-md bg-[#3d3258] text-white",
                )}
              >
                {m.text}
              </p>
            </div>
          );
        })}
      </div>

      <form
        className="shrink-0 border-t border-white/10 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {error && <p className="mb-2 text-xs text-[#ff9fb2]">{error}</p>}
        <div className="flex items-end gap-2 rounded-2xl bg-[#32284a] p-1.5 pl-3.5 focus-within:ring-2 focus-within:ring-lavender">
          <textarea
            ref={inputRef}
            rows={1}
            maxLength={1000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Send a message"
            aria-label="Message"
            className="max-h-28 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm text-white outline-none placeholder:text-white/40"
          />
          <button
            type="submit"
            disabled={!text.trim() || isSending}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-lavender text-plum-deep transition hover:bg-lavender-strong disabled:bg-transparent disabled:text-white/30"
            aria-label="Send"
          >
            {isSending ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
          </button>
        </div>
      </form>
    </aside>
  );
}
