import { useState, type SubmitEvent } from "react";
import { MAX_LED_LENGTH, type ClientMessage, type Playback, type RoomAccess } from "../shared/protocol.ts";
import { RoomAccessControls } from "./RoomAccessControls.tsx";
import type { PlayerTick } from "./Screen.tsx";

const SKIP_SECONDS = 10;

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

type Props = {
  roomId: number;
  access: RoomAccess;
  playback: Playback;
  led: string;
  tick: PlayerTick;
  send: (message: ClientMessage) => void;
};

export function AdminConsole({ roomId, access, playback, led, tick, send }: Props) {
  const [ledDraft, setLedDraft] = useState(led);
  const [url, setUrl] = useState("");
  const [isLive, setIsLive] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    send({ t: "load", url, isLive });
    setUrl("");
  };

  const seek = (position: number) => send({ t: "control", action: "seek", position });
  const commitDrag = () => {
    if (dragging !== null) seek(dragging);
    setDragging(null);
  };

  const hasVideo = Boolean(playback.videoId);
  const position = dragging ?? tick.position;
  const canSeek = hasVideo && !playback.isLive;

  return (
    <section className="console" aria-label="Điều khiển phòng chiếu">
      <h2>Điều khiển phòng chiếu</h2>
      <RoomAccessControls roomId={roomId} access={access} />
      {playback.title && <p className="console-title">{playback.title}</p>}
      <form className="console-load" onSubmit={submit}>
        <input aria-label="Link video YouTube" placeholder="Dán link YouTube" value={url} onChange={(event) => setUrl(event.target.value)} required />
        <label className="check">
          <input type="checkbox" checked={isLive} onChange={(event) => setIsLive(event.target.checked)} />
          Đây là livestream
        </label>
        <button className="tool-button" type="submit">
          Chiếu video này
        </button>
      </form>

      {hasVideo && (
        <div className="console-transport">
          {playback.status === "playing" ? (
            <button className="tool-button is-primary" onClick={() => send({ t: "control", action: "pause" })}>
              Tạm dừng cả rạp
            </button>
          ) : (
            <button className="tool-button is-primary" onClick={() => send({ t: "control", action: "play" })}>
              Phát cho cả rạp
            </button>
          )}
          {canSeek && (
            <>
              <button className="tool-button" onClick={() => seek(Math.max(0, tick.position - SKIP_SECONDS))}>
                Lùi 10 giây
              </button>
              <button className="tool-button" onClick={() => seek(tick.position + SKIP_SECONDS)}>
                Tới 10 giây
              </button>
              <label className="scrub">
                <span className="scrub-time">
                  {formatTime(position)} / {formatTime(tick.duration)}
                </span>
                <input
                  type="range"
                  aria-label="Tua video"
                  min={0}
                  max={tick.duration || 1}
                  step={1}
                  value={Math.min(position, tick.duration || 1)}
                  disabled={!tick.duration}
                  onChange={(event) => setDragging(Number(event.target.value))}
                  onPointerUp={commitDrag}
                  onKeyUp={commitDrag}
                />
              </label>
            </>
          )}
        </div>
      )}

      <form
        className="console-load"
        onSubmit={(event) => {
          event.preventDefault();
          send({ t: "led", text: ledDraft });
        }}
      >
        <input aria-label="Chữ trên bảng LED" placeholder="Chữ trên bảng LED" value={ledDraft} maxLength={MAX_LED_LENGTH} onChange={(event) => setLedDraft(event.target.value)} />
        <button className="tool-button" type="submit">
          Đổi chữ bảng LED
        </button>
      </form>
    </section>
  );
}
