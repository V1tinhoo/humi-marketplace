"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Trash2, Upload } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn, initials } from "@/lib/utils";
import { isOptimizableImage } from "@/lib/images";

const BUCKET = "avatars";
const ACCEPT = ["image/jpeg", "image/png", "image/webp"];
const MAX_INPUT_BYTES = 15 * 1024 * 1024; // before compression
const OUTPUT_SIZE = 800; // px, square

/**
 * Center-crops to a square, resizes and re-encodes as JPEG in the browser.
 * Re-encoding also strips EXIF metadata (including GPS location) from phone photos.
 */
async function prepareImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const side = Math.min(bitmap.width, bitmap.height);
  const target = Math.min(OUTPUT_SIZE, side);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = target;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser couldn't process this image.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, target, target);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't compress the image."))), "image/jpeg", 0.88),
  );
}

function storageErrorMessage(message: string) {
  const m = message.toLowerCase();
  if (m.includes("bucket not found")) return "Photo storage isn't set up yet. Run the avatar storage migration in Supabase.";
  if (m.includes("row-level security") || m.includes("unauthorized")) return "You need to be logged in to upload a photo.";
  if (m.includes("exceeded") || m.includes("too large")) return "That image is too large. Please use one under 5 MB.";
  if (m.includes("fetch")) return "We couldn't reach the server. Check your connection and try again.";
  return message;
}

export function AvatarUpload({
  value,
  name,
  onChange,
  size = "lg",
  className,
}: {
  /** Current photo URL (or empty). */
  value: string | null | undefined;
  name: string;
  /** Called after the photo is saved to the profile (null = removed). */
  onChange?: (url: string | null) => void;
  size?: "md" | "lg";
  className?: string;
}) {
  const { user, mode } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [current, setCurrent] = useState(value ?? null);
  const [state, setState] = useState<"idle" | "working">("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => setCurrent(value ?? null), [value]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const supabase = getSupabaseBrowserClient();
  const disabled = mode === "demo" || !user || !supabase;
  const shown = preview ?? current;
  const dim = size === "lg" ? "size-28" : "size-20";

  /** Deletes every file in the user's folder except `keep`. */
  const cleanup = async (keep?: string) => {
    if (!supabase || !user) return;
    const { data } = await supabase.storage.from(BUCKET).list(user.id, { limit: 100 });
    const stale = (data ?? []).map((f) => `${user.id}/${f.name}`).filter((p) => p !== keep);
    if (stale.length) await supabase.storage.from(BUCKET).remove(stale);
  };

  const handleFile = async (file: File) => {
    setError(null);
    setNotice(null);
    if (!ACCEPT.includes(file.type)) return setError("Please choose a JPG, PNG or WebP image.");
    if (file.size > MAX_INPUT_BYTES) return setError("That file is over 15 MB. Please choose a smaller photo.");
    if (!supabase || !user) return;

    setState("working");
    try {
      const blob = await prepareImage(file);
      setPreview(URL.createObjectURL(blob));
      // A new file name each time, so the CDN never serves an old cached photo.
      const path = `${user.id}/avatar-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, {
        contentType: "image/jpeg",
        cacheControl: "31536000",
        upsert: false,
      });
      if (upErr) throw new Error(storageErrorMessage(upErr.message));
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const { error: dbErr } = await supabase.from("profiles").update({ avatar_url: pub.publicUrl }).eq("id", user.id);
      if (dbErr) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw new Error(dbErr.message);
      }
      await cleanup(path);
      setCurrent(pub.publicUrl);
      setNotice("Photo updated");
      onChange?.(pub.publicUrl);
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "Upload failed. Please try again.");
    } finally {
      setState("idle");
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async () => {
    if (!supabase || !user || !current) return;
    if (!confirm("Remove your profile photo?")) return;
    setState("working");
    setError(null);
    const { error: dbErr } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
    if (dbErr) setError(dbErr.message);
    else {
      await cleanup();
      setPreview(null);
      setCurrent(null);
      setNotice("Photo removed");
      onChange?.(null);
    }
    setState("idle");
  };

  return (
    <div className={cn("flex items-center gap-5", className)}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || state === "working"}
        aria-label={shown ? "Change profile photo" : "Upload profile photo"}
        className={cn(
          "group relative shrink-0 overflow-hidden rounded-[1.5rem] transition",
          dim,
          shown ? "ring-4 ring-white shadow-soft" : "border-2 border-dashed border-lavender bg-cream hover:bg-lilac",
          disabled && "cursor-not-allowed opacity-70",
        )}
      >
        {shown ? (
          <Image src={shown} alt={`Photo of ${name}`} fill sizes="112px" className="object-cover" unoptimized={!isOptimizableImage(shown)} />
        ) : (
          <span className="grid size-full place-items-center text-plum-soft">
            {name ? <span className="text-2xl font-bold text-plum/40">{initials(name)}</span> : <Camera className="size-6" />}
          </span>
        )}
        {!disabled && (
          <span className={cn("absolute inset-0 grid place-items-center bg-plum-deep/45 text-white transition", state === "working" ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
            {state === "working" ? <Loader2 className="size-6 animate-spin" /> : <Camera className="size-6" />}
          </span>
        )}
      </button>

      <div className="min-w-0">
        <p className="text-sm font-semibold">Profile photo</p>
        {disabled ? (
          <p className="mt-1 text-xs text-plum-soft">{mode === "demo" ? "Photo uploads need Supabase (demo mode)." : "Log in to upload a photo."}</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-plum-soft">A clear, friendly photo of your face. JPG, PNG or WebP. We crop it square and remove location data.</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={state === "working"}
                className="inline-flex items-center gap-1.5 rounded-full bg-lilac px-3.5 py-1.5 text-xs font-semibold transition hover:bg-lavender disabled:opacity-50"
              >
                <Upload className="size-3.5" /> {state === "working" ? "Uploading…" : shown ? "Change photo" : "Upload photo"}
              </button>
              {current && (
                <button
                  type="button"
                  onClick={remove}
                  disabled={state === "working"}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-plum-soft transition hover:bg-blush hover:text-plum disabled:opacity-50"
                >
                  <Trash2 className="size-3.5" /> Remove
                </button>
              )}
            </div>
          </>
        )}
        {error && <p role="alert" className="mt-2 text-xs font-medium text-[#a3324a]">{error}</p>}
        {notice && !error && <p role="status" className="mt-2 text-xs font-medium text-online">{notice}</p>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
    </div>
  );
}
