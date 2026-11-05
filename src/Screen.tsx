import { useCallback, useEffect, useRef, useState } from "react";
import type { Playback } from "../shared/protocol.ts";
import { correction, expectedPosition } from "../shared/sync.ts";
import { loadYouTubeApi } from "./youtube.ts";

const STATE_ENDED = 0;
const STATE_PLAYING = 1;
const STATE_BUFFERING = 3;
const SYNC_INTERVAL_MS = 1000;
const PAUSED_TOLERANCE = 0.5;
const VOLUME_KEY = "rap-t1-volume";

export type PlayerTick = { position: number; duration: number };

function readVolume(): number {
  try {
    const stored = Number(localStorage.getItem(VOLUME_KEY));
    return stored > 0 && stored <= 100 ? stored : 80;
  } catch {
    return 80;
  }
}

type Props = {
  playback: Playback;
  led: string;
  serverNow: () => number;
  onTick: (tick: PlayerTick) => void;
};

export function Screen({ playback, led, serverNow, onTick }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const mount = useRef<HTMLDivElement>(null);
  const player = useRef<YT.Player | null>(null);
  const loadedVideo = useRef<string | null>(null);
  const playbackRef = useRef(playback);
  playbackRef.current = playback;

  const [ready, setReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [volume, setVolume] = useState(readVolume);
  const [drift, setDrift] = useState<number | null>(null);
  const unlockedRef = useRef(false);

  const sync = useCallback(() => {
    const current = playbackRef.current;
    const expected = expectedPosition(current, serverNow());
    const yt = player.current;
    if (!yt || !current.videoId) {
      onTick({ position: expected, duration: 0 });
      return;
    }
    const duration = yt.getDuration() || 0;
    onTick({ position: duration ? Math.min(expected, duration) : expected, duration });
    if (!unlockedRef.current) return;

    const state = yt.getPlayerState();
    const position = yt.getCurrentTime();
    const moving = state === STATE_PLAYING || state === STATE_BUFFERING;

    if (current.status === "paused") {
      if (moving) yt.pauseVideo();
      if (!current.isLive && Math.abs(position - expected) > PAUSED_TOLERANCE) yt.seekTo(expected, true);
      setDrift(null);
      return;
    }
    if (current.isLive) {
      if (!moving) yt.playVideo();
      setDrift(null);
      return;
    }
    if (duration && expected >= duration) {
      if (state !== STATE_ENDED) yt.seekTo(duration, true);
      setDrift(null);
      return;
    }
    if (!moving) {
      if (correction(position - expected).kind === "seek") yt.seekTo(expected, true);
      yt.playVideo();
      return;
    }
    if (state === STATE_BUFFERING) return;

    const offBy = position - expected;
    const fix = correction(offBy);
    if (fix.kind === "seek") yt.seekTo(expected, true);
    else if (yt.getPlaybackRate() !== fix.rate) yt.setPlaybackRate(fix.rate);
    setDrift(offBy);
  }, [serverNow, onTick]);

  // The iframe stays outside React's tree: YouTube replaces the mount node with it.
  useEffect(() => {
    if (!playback.videoId || player.current) return;
    let cancelled = false;
    loadYouTubeApi().then(
      () => {
        if (cancelled || !mount.current || !window.YT) return;
        loadedVideo.current = playbackRef.current.videoId;
        const node = document.createElement("div");
        mount.current.replaceChildren(node);
        const created = new window.YT.Player(node, {
          videoId: playbackRef.current.videoId!,
          playerVars: { controls: 0, disablekb: 1, rel: 0, playsinline: 1, origin: location.origin },
          events: {
            onReady: () => {
              player.current = created;
              created.setVolume(readVolume());
              setReady(true);
            },
            onStateChange: () => sync(),
          },
        });
      },
      () => setLoadFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [playback.videoId, sync]);

  useEffect(() => {
    return () => {
      player.current?.destroy();
      player.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !playback.videoId || loadedVideo.current === playback.videoId) return;
    loadedVideo.current = playback.videoId;
    player.current?.cueVideoById(playback.videoId);
  }, [ready, playback.videoId]);

  useEffect(() => {
    sync();
    const timer = setInterval(sync, SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [sync, ready, playback.revision]);

  const unlock = () => {
    unlockedRef.current = true;
    setUnlocked(true);
    const yt = player.current;
    if (!yt) return;
    yt.unMute();
    yt.setVolume(volume);
    sync();
  };

  const changeVolume = (value: number) => {
    setVolume(value);
    player.current?.setVolume(value);
    if (value > 0) player.current?.unMute();
    try {
      localStorage.setItem(VOLUME_KEY, String(value));
    } catch {
      // Volume simply will not be remembered next visit.
    }
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else frame.current?.requestFullscreen();
  };

  const goLive = () => {
    const yt = player.current;
    if (yt) yt.seekTo(yt.getDuration(), true);
  };

  const hasVideo = Boolean(playback.videoId);

  return (
    <section className="screen-area" aria-label="Màn chiếu">
      <div className="screen" ref={frame}>
        <div className="screen-player" ref={mount} hidden={!hasVideo} />
        {!hasVideo && (
          <div className="screen-empty">
            <img src="/brand/cup.jpg" alt="" />
            <p>Quản trị viên chưa chọn trận để chiếu.</p>
          </div>
        )}
        {hasVideo && !unlocked && (
          <div className="screen-gate">
            <button className="cta" onClick={unlock} disabled={!ready}>
              <span>{ready ? "Xem cùng cả rạp" : "Đang chuẩn bị màn chiếu"}</span>
            </button>
          </div>
        )}
        {loadFailed && <p className="screen-error">Không tải được trình phát YouTube. Hãy kiểm tra mạng rồi tải lại trang.</p>}
      </div>

      <div className="screen-bar">
        <div className="led" role="status" aria-label={led}>
          <span className="led-tag">T1 WIN</span>
          <div className="led-window" aria-hidden="true">
            <span className="led-text">{led}</span>
          </div>
        </div>
        <div className="screen-tools">
          {hasVideo && (
            <span className="sync-state" data-drift={drift ?? ""}>
              {playback.status === "paused" ? "Đang tạm dừng" : playback.isLive ? "Trực tiếp" : "Đồng bộ"}
            </span>
          )}
          {playback.isLive && hasVideo && unlocked && (
            <button className="tool-button" onClick={goLive}>
              Về trực tiếp
            </button>
          )}
          <label className="volume">
            <span className="sr-only">Âm lượng</span>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4Zm12 .5a3.5 3.5 0 0 1 0 5v-5Z" />
            </svg>
            <input type="range" min={0} max={100} value={volume} onChange={(event) => changeVolume(Number(event.target.value))} />
          </label>
          {hasVideo && (
            <a className="tool-button" href={`https://www.youtube.com/watch?v=${playback.videoId}`} target="_blank" rel="noreferrer">
              Mở link YouTube
            </a>
          )}
          <button className="tool-button" onClick={toggleFullscreen}>
            Toàn màn hình
          </button>
        </div>
      </div>
    </section>
  );
}
