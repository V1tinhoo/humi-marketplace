/**
 * SERVER-ONLY LiveKit helpers (tokens, room checks). The API secret never leaves the server.
 * LiveKit is the source of truth for "both people are connected" — billing never trusts the browser.
 */
import { AccessToken, RoomServiceClient, TrackSource, WebhookReceiver } from "livekit-server-sdk";

const URL_WS = process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "";
const API_KEY = process.env.LIVEKIT_API_KEY ?? "";
const API_SECRET = process.env.LIVEKIT_API_SECRET ?? "";

export const isLiveKitConfigured = Boolean(URL_WS && API_KEY && API_SECRET);
export const liveKitUrl = URL_WS;

const httpUrl = () => URL_WS.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
let rooms: RoomServiceClient | null = null;
const roomService = () => (rooms ??= new RoomServiceClient(httpUrl(), API_KEY, API_SECRET));

/** Identity inside the LiveKit room: role + user id, so the server can tell who is who. */
export const identityFor = (role: "customer" | "host", userId: string) => `${role}:${userId}`;

export async function createJoinToken(opts: { room: string; identity: string; name: string; video: boolean }) {
  const at = new AccessToken(API_KEY, API_SECRET, { identity: opts.identity, name: opts.name, ttl: "2h" });
  at.addGrant({
    roomJoin: true,
    room: opts.room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true, // in-call chat
    // Audio calls are billed at the audio price, so the camera is off there; screen sharing works in both.
    canPublishSources: opts.video
      ? [TrackSource.MICROPHONE, TrackSource.CAMERA, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]
      : [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO],
  });
  return at.toJwt();
}

/** Creates the room with a 2-person limit (idempotent). */
export async function ensureRoom(room: string) {
  try {
    await roomService().createRoom({ name: room, maxParticipants: 2, emptyTimeout: 120 });
  } catch {
    /* already exists */
  }
}

/** True only when BOTH expected identities are currently in the LiveKit room. */
export async function bothInRoom(room: string, customerIdentity: string, hostIdentity: string) {
  try {
    const people = await roomService().listParticipants(room);
    const ids = new Set(people.map((p) => p.identity));
    return ids.has(customerIdentity) && ids.has(hostIdentity);
  } catch {
    return false; // room not created yet / gone → not connected
  }
}

export async function closeRoom(room: string) {
  try {
    await roomService().deleteRoom(room);
  } catch {
    /* already gone */
  }
}

export function webhookReceiver() {
  return new WebhookReceiver(API_KEY, API_SECRET);
}
