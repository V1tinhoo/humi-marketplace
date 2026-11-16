/**
 * Call sounds generated with the Web Audio API (no audio files to download).
 *  - "ringback": what the caller hears while the other side rings (425 Hz, 1 s on / 4 s off,
 *    the Brazilian ringback cadence).
 *  - "ringtone": what the host hears for an incoming call (two-tone chime every 2 s).
 * Browsers only allow sound after the person has interacted with the page; if audio is still
 * blocked, it starts on the next click or key press.
 */
type Kind = "ringback" | "ringtone";

let ctx: AudioContext | null = null;
function audio() {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  return ctx;
}

function tone(ac: AudioContext, freq: number, start: number, duration: number, volume: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  // Short fades avoid clicks.
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.02);
  gain.gain.setValueAtTime(volume, start + duration - 0.03);
  gain.gain.linearRampToValueAtTime(0, start + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration + 0.01);
}

function playOnce(ac: AudioContext, kind: Kind) {
  const t = ac.currentTime + 0.02;
  if (kind === "ringback") {
    tone(ac, 425, t, 1, 0.12);
  } else {
    tone(ac, 880, t, 0.18, 0.18);
    tone(ac, 660, t + 0.22, 0.18, 0.18);
    tone(ac, 880, t + 0.6, 0.18, 0.18);
    tone(ac, 660, t + 0.82, 0.18, 0.18);
  }
}

/** Starts the sound (repeating) and returns a function that stops it. */
export function startRing(kind: Kind): () => void {
  const ac = audio();
  if (!ac) return () => {};
  const every = kind === "ringback" ? 5000 : 2000;
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const begin = () => {
    if (stopped || timer) return;
    playOnce(ac, kind);
    timer = setInterval(() => playOnce(ac, kind), every);
    if (kind === "ringtone" && "vibrate" in navigator) {
      try {
        navigator.vibrate([400, 200, 400]);
      } catch {
        /* not supported */
      }
    }
  };
  const unlock = () => {
    ac.resume().then(begin, () => {});
  };

  if (ac.state === "running") begin();
  else {
    ac.resume().then(begin, () => {});
    // Autoplay blocked: start on the first interaction.
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
  }

  return () => {
    stopped = true;
    if (timer) clearInterval(timer);
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    try {
      navigator.vibrate?.(0);
    } catch {
      /* ignore */
    }
  };
}
