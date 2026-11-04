type Timed = { status: "playing" | "paused"; position: number; updatedAt: number };

/** Where the whole theatre should be in the video at serverNow. */
export function expectedPosition(playback: Timed, serverNow: number): number {
  if (playback.status === "paused") return playback.position;
  return playback.position + Math.max(0, serverNow - playback.updatedAt) / 1000;
}

const SEEK_THRESHOLD = 1.5;
const NUDGE_THRESHOLD = 0.25;

/** Seek on a large drift; nudge the playback rate on a small one so viewers see no jump. */
export function correction(drift: number): { kind: "seek" } | { kind: "rate"; rate: number } {
  if (Math.abs(drift) > SEEK_THRESHOLD) return { kind: "seek" };
  if (Math.abs(drift) > NUDGE_THRESHOLD) return { kind: "rate", rate: drift > 0 ? 0.95 : 1.05 };
  return { kind: "rate", rate: 1 };
}

export function parseYouTubeId(input: string): string | null {
  const text = input.trim();
  if (/^[\w-]{11}$/.test(text)) return text;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com") {
    const [, kind, value] = url.pathname.split("/");
    id = kind === "live" || kind === "embed" || kind === "shorts" ? value ?? null : url.searchParams.get("v");
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}
