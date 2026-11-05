import { useEffect, useRef, useState } from "react";
import type { MusicConfig, MusicTrack } from "../shared/protocol.ts";
import { parseYouTubeId } from "../shared/sync.ts";
import { fetchMusicConfig, saveMusicConfig } from "./api.ts";
import { loadYouTubeApi } from "./youtube.ts";

const STATE_ENDED = 0;
const STATE_PLAYING = 1;
const STATE_BUFFERING = 3;
const CONFIG_KEY = "rap-t1-music-config";
const VOLUME_KEY = "rap-t1-music-volume";

export const DEFAULT_MUSIC_CONFIG: MusicConfig = {
  initialTrackId: "bao-thuc-t1",
  mode: "random",
  tracks: [
    {
      id: "bao-thuc-t1",
      title: "Báo thức T1 đánh (Mùa World)",
      detail: "therta_at (TikTok)",
      type: "audio",
      url: "/music/bao_thuc_t1.mp3",
    },
    { id: "5FrhtahQiRc", title: "Heavy Is The Crown", detail: "Linkin Park, CKTG 2024", type: "youtube" },
    { id: "C3GouGa0noM", title: "GODS", detail: "NewJeans, CKTG 2023", type: "youtube" },
    { id: "r6zIGXun57U", title: "Legends Never Die", detail: "Against The Current, CKTG 2017", type: "youtube" },
    { id: "fB8TyLTD7EE", title: "RISE", detail: "The Glitch Mob, Mako, CKTG 2018", type: "youtube" },
    { id: "pzt6SmvGpXk", title: "Sacrifice", detail: "G.E.M., CKTG 2025", type: "youtube" },
    { id: "mlFxxNsExJc", title: "Know My Name", detail: "True Damage, CKTG 2026", type: "youtube" },
    { id: "HYsz1hP0BFo", title: "STAR WALKIN'", detail: "Lil Nas X, CKTG 2022", type: "youtube" },
    { id: "1Z6CHioIn3s", title: "Burn It All Down", detail: "PVRIS, CKTG 2021", type: "youtube" },
    { id: "KbNL9ZyB49c", title: "Take Over", detail: "Jeremy McKinnon, CKTG 2020", type: "youtube" },
    { id: "i1IKnWDecwA", title: "Phoenix", detail: "Cailin Russo, CKTG 2019", type: "youtube" },
    { id: "fmI_Ndrxy14", title: "Warriors", detail: "Imagine Dragons, CKTG 2014", type: "youtube" },
  ],
};

function loadStoredConfig(): MusicConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return DEFAULT_MUSIC_CONFIG;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.tracks) && parsed.tracks.length > 0) {
      return {
        initialTrackId: parsed.initialTrackId || DEFAULT_MUSIC_CONFIG.initialTrackId,
        mode: parsed.mode === "sequence" ? "sequence" : "random",
        tracks: parsed.tracks,
      };
    }
  } catch {
    // Ignore parse error
  }
  return DEFAULT_MUSIC_CONFIG;
}

function pickRandomIndex(current: number, total: number): number {
  if (total <= 1) return 0;
  let next = Math.floor(Math.random() * (total - 1));
  if (next >= current) next += 1;
  return next;
}

type Props = {
  admin?: boolean;
};

export function MusicPlayer({ admin }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const player = useRef<YT.Player | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [config, setConfig] = useState<MusicConfig>(loadStoredConfig);
  const [trackIndex, setTrackIndex] = useState(() => {
    const idx = config.tracks.findIndex((t) => t.id === config.initialTrackId);
    return idx >= 0 ? idx : 0;
  });
  const [playing, setPlaying] = useState(false);
  const [volume] = useState(() => {
    try {
      const raw = localStorage.getItem(VOLUME_KEY);
      const v = raw === null ? NaN : Number(raw);
      // A missing key used to read as 0 and muted everything; 0 is also treated as "never set".
      return Number.isFinite(v) && v > 0 && v <= 100 ? v : 40;
    } catch {
      return 40;
    }
  });
  const [modalOpen, setModalOpen] = useState(false);

  const configRef = useRef(config);
  configRef.current = config;
  const trackIndexRef = useRef(trackIndex);
  trackIndexRef.current = trackIndex;
  const isPlayingRef = useRef(playing);
  isPlayingRef.current = playing;
  const userPausedRef = useRef(false);

  // Đồng bộ cấu hình từ máy chủ (hoặc khi admin cập nhật)
  useEffect(() => {
    fetchMusicConfig().then((serverConfig) => {
      if (serverConfig && Array.isArray(serverConfig.tracks) && serverConfig.tracks.length > 0) {
        setConfig(serverConfig);
        try {
          localStorage.setItem(CONFIG_KEY, JSON.stringify(serverConfig));
        } catch {
          // Ignore storage errors
        }
      }
    });
  }, []);

  const playIndex = (index: number) => {
    const total = configRef.current.tracks.length;
    if (total === 0) return;
    const next = (index + total) % total;
    setTrackIndex(next);
    const targetTrack = configRef.current.tracks[next];

    if (targetTrack.type === "audio") {
      player.current?.pauseVideo();
      if (audioRef.current) {
        audioRef.current.src = targetTrack.url || "/music/bao_thuc_t1.mp3";
        audioRef.current.volume = volume / 100;
        if (!userPausedRef.current) {
          audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
        }
      }
    } else {
      audioRef.current?.pause();
      if (player.current) {
        player.current.loadVideoById(targetTrack.id);
        player.current.setVolume(volume);
        if (!userPausedRef.current) {
          player.current.playVideo();
        }
      }
    }
  };
  const playIndexRef = useRef(playIndex);
  playIndexRef.current = playIndex;

  const onTrackEnded = () => {
    const currentCfg = configRef.current;
    if (currentCfg.mode === "random") {
      const next = pickRandomIndex(trackIndexRef.current, currentCfg.tracks.length);
      playIndexRef.current(next);
    } else {
      playIndexRef.current(trackIndexRef.current + 1);
    }
  };
  const onTrackEndedRef = useRef(onTrackEnded);
  onTrackEndedRef.current = onTrackEnded;

  // Khởi tạo Audio Element
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.volume = volume / 100;
    const first = configRef.current.tracks[trackIndexRef.current];
    if (first?.type === "audio") audio.src = first.url || "/music/bao_thuc_t1.mp3";
    audioRef.current = audio;

    const handleEnded = () => onTrackEndedRef.current();
    const handlePlay = () => setPlaying(true);
    const handlePause = () => {
      // Chỉ setPlaying(false) nếu track hiện tại là audio
      if (configRef.current.tracks[trackIndexRef.current]?.type === "audio") {
        setPlaying(false);
      }
    };

    // A file that cannot load should not leave the player stuck: move on to the next track.
    const handleError = () => onTrackEndedRef.current();

    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);

    return () => {
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.pause();
      audioRef.current = null;
    };
  }, [volume]);

  // Khởi tạo YouTube Iframe Player
  useEffect(() => {
    let cancelled = false;

    const start = () => {
      if (cancelled || !mount.current || !window.YT) return;
      const node = document.createElement("div");
      mount.current.replaceChildren(node);

      const currentTrack = configRef.current.tracks[trackIndexRef.current];
      const initialYtId = currentTrack?.type !== "audio" ? currentTrack?.id : "5FrhtahQiRc";

      const created = new window.YT.Player(node, {
        videoId: initialYtId,
        width: "200",
        height: "200",
        playerVars: {
          autoplay: 1,
          rel: 0,
          playsinline: 1,
          origin: location.origin,
        },
        events: {
          onReady: () => {
            if (cancelled) return;
            player.current = created;
            created.setVolume(volume);

            const activeTrack = configRef.current.tracks[trackIndexRef.current];
            if (!userPausedRef.current) {
              if (activeTrack?.type === "audio") {
                // Real browsers block this until the first click; the unlock listener below retries then.
                audioRef.current?.play().then(() => setPlaying(true)).catch(() => {});
              } else {
                created.playVideo();
              }
            }
          },
          onStateChange: (event) => {
            const activeTrack = configRef.current.tracks[trackIndexRef.current];
            if (activeTrack?.type === "audio") return;
            const isNowPlaying = event.data === STATE_PLAYING || event.data === STATE_BUFFERING;
            setPlaying(isNowPlaying);
            if (event.data === STATE_ENDED) onTrackEndedRef.current();
          },
          onError: () => {
            // Khi YouTube bị lỗi tải bài, tự chuyển bài tiếp
            onTrackEndedRef.current();
          },
        },
      });
    };

    if (window.YT?.Player) start();
    else loadYouTubeApi().then(start, () => {});

    // Mở khóa autoplay có tiếng khi người dùng tương tác lần đầu
    const events = ["pointerdown", "click", "keydown", "touchstart"] as const;
    const removeUnlock = () => events.forEach((name) => window.removeEventListener(name, unlockAutoplay));
    function unlockAutoplay() {
      if (userPausedRef.current) return removeUnlock();
      if (isPlayingRef.current) return removeUnlock();
      const activeTrack = configRef.current.tracks[trackIndexRef.current];
      if (activeTrack?.type === "audio" && audioRef.current) {
        // Only stop listening once the browser has actually let the sound start.
        audioRef.current.play().then(() => { setPlaying(true); removeUnlock(); }).catch(() => {});
      } else if (player.current) {
        player.current.playVideo();
      }
    }
    events.forEach((name) => window.addEventListener(name, unlockAutoplay));

    return () => {
      cancelled = true;
      removeUnlock();
      player.current?.destroy();
      player.current = null;
    };
  }, [volume]);

  const toggleMusic = () => {
    const activeTrack = config.tracks[trackIndex];
    if (playing) {
      userPausedRef.current = true;
      if (activeTrack?.type === "audio") {
        audioRef.current?.pause();
      } else {
        player.current?.pauseVideo();
      }
      setPlaying(false);
    } else {
      userPausedRef.current = false;
      if (activeTrack?.type === "audio") {
        if (audioRef.current) {
          if (!audioRef.current.src) audioRef.current.src = activeTrack.url || "/music/bao_thuc_t1.mp3";
          audioRef.current.volume = volume / 100;
          audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
        }
      } else {
        player.current?.playVideo();
      }
    }
  };

  const current = config.tracks[trackIndex] || config.tracks[0];

  const handleSaveConfig = async (newConfig: MusicConfig) => {
    setConfig(newConfig);
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(newConfig));
    } catch {
      // Ignore
    }
    await saveMusicConfig(newConfig);
  };

  return (
    <>
      {/* Container ẩn ngoài màn hình để YouTube API hoạt động */}
      <div
        ref={mount}
        style={{
          position: "fixed",
          left: "-9999px",
          bottom: 0,
          width: "200px",
          height: "200px",
          opacity: 0,
          pointerEvents: "none",
        }}
        aria-hidden="true"
      />

      {/* Cụm điều khiển nhạc nổi ở góc dưới */}
      <div className="music-player-wrap">
        {admin && (
          <button
            type="button"
            className="music-admin-btn"
            onClick={() => setModalOpen(true)}
            title="Cấu hình nhạc nền & bài auto phát (Admin)"
            aria-label="Cài đặt nhạc nền"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
              <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
            </svg>
          </button>
        )}

        <button
          type="button"
          className={`music-toggle-btn ${playing ? "is-playing" : "is-paused"}`}
          onClick={toggleMusic}
          title={playing ? `Đang phát: ${current?.title} (Bấm để tắt nhạc)` : "Bật nhạc nền"}
          aria-label={playing ? "Tắt nhạc nền" : "Bật nhạc nền"}
        >
          {playing ? (
            /* Icon sóng nhạc đang nhảy theo điệu nhạc */
            <div className="music-bars" aria-hidden="true">
              <span className="bar bar-1" />
              <span className="bar bar-2" />
              <span className="bar bar-3" />
              <span className="bar bar-4" />
            </div>
          ) : (
            /* Icon nốt nhạc bị tắt */
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" fill="currentColor" />
              <circle cx="18" cy="16" r="3" fill="currentColor" />
              <line x1="2" y1="2" x2="22" y2="22" strokeWidth="2.5" />
            </svg>
          )}
        </button>
      </div>

      {modalOpen && (
        <MusicConfigModal
          config={config}
          onSave={handleSaveConfig}
          onPreviewTrack={(track) => {
            const idx = config.tracks.findIndex((t) => t.id === track.id);
            if (idx >= 0) playIndex(idx);
          }}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

type ModalProps = {
  config: MusicConfig;
  onSave: (newConfig: MusicConfig) => Promise<void>;
  onPreviewTrack: (track: MusicTrack) => void;
  onClose: () => void;
};

function MusicConfigModal({ config, onSave, onPreviewTrack, onClose }: ModalProps) {
  const [initialId, setInitialId] = useState(config.initialTrackId);
  const [mode, setMode] = useState<"sequence" | "random">(config.mode);
  const [tracks, setTracks] = useState<MusicTrack[]>([...config.tracks]);
  const [newUrl, setNewUrl] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDetail, setNewDetail] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Đóng khi ấn Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const moveTrack = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= tracks.length) return;
    const next = [...tracks];
    const temp = next[index];
    next[index] = next[target];
    next[target] = temp;
    setTracks(next);
  };

  const removeTrack = (index: number) => {
    if (tracks.length <= 1) {
      alert("Cần giữ lại ít nhất 1 bài hát trong danh sách!");
      return;
    }
    const removed = tracks[index];
    const next = tracks.filter((_, i) => i !== index);
    setTracks(next);
    if (initialId === removed.id && next.length > 0) {
      setInitialId(next[0].id);
    }
  };

  const handleAddTrack = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = newUrl.trim();
    if (!cleanUrl) return;

    let trackId: string | null = null;
    let trackType: "youtube" | "audio" = "youtube";
    let finalUrl: string | undefined = undefined;

    if (cleanUrl.endsWith(".mp3") || cleanUrl.endsWith(".wav") || cleanUrl.includes("/music/")) {
      trackType = "audio";
      trackId = `audio-${Date.now()}`;
      finalUrl = cleanUrl;
    } else {
      const parsedId = parseYouTubeId(cleanUrl);
      if (!parsedId) {
        alert("Link YouTube không hợp lệ! Vui lòng nhập link video YouTube hoặc ID video 11 ký tự.");
        return;
      }
      trackId = parsedId;
      trackType = "youtube";
    }

    const title = newTitle.trim() || (trackType === "audio" ? "Audio Track" : `YouTube Video (${trackId})`);
    const detail = newDetail.trim() || "Thêm bởi Admin";

    const newTrack: MusicTrack = {
      id: trackId,
      title,
      detail,
      type: trackType,
      url: finalUrl,
    };

    setTracks([...tracks, newTrack]);
    setNewUrl("");
    setNewTitle("");
    setNewDetail("");
  };

  const handleSave = async () => {
    setSaving(true);
    setStatusMessage(null);
    try {
      await onSave({
        initialTrackId: initialId,
        mode,
        tracks,
      });
      setStatusMessage("✅ Đã lưu cấu hình nhạc nền thành công! Áp dụng cho toàn bộ người xem.");
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      setStatusMessage("❌ Lỗi lưu cấu hình: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefault = () => {
    if (confirm("Bạn có chắc chắn muốn đặt lại danh sách nhạc về mặc định của rạp T1?")) {
      setTracks([...DEFAULT_MUSIC_CONFIG.tracks]);
      setInitialId(DEFAULT_MUSIC_CONFIG.initialTrackId);
      setMode(DEFAULT_MUSIC_CONFIG.mode);
    }
  };

  return (
    <div className="music-modal-backdrop" onClick={onClose}>
      <div className="music-modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header className="music-modal-header">
          <div>
            <h3>⚙️ Cấu hình Nhạc nền (Admin)</h3>
            <p>Chọn bài auto phát khi mở web, thứ tự bài hát hoặc chế độ phát ngẫu nhiên.</p>
          </div>
          <button type="button" className="music-modal-close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </header>

        {statusMessage && <div className="music-modal-notice">{statusMessage}</div>}

        <div className="music-modal-body">
          {/* 1. BÀI AUTO PHÁT KHI MỞ WEB */}
          <div className="music-modal-section">
            <label className="music-section-label">
              <span className="section-title">⭐ Bài tự động phát khi vào website:</span>
              <span className="section-desc">Bài này sẽ được ưu tiên phát ngay khi khách mở trang web.</span>
            </label>
            <select
              className="music-select"
              value={initialId}
              onChange={(e) => setInitialId(e.target.value)}
            >
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.type === "audio" ? "🎵 [MP3] " : "▶️ [YouTube] "}
                  {t.title} - {t.detail}
                </option>
              ))}
            </select>
          </div>

          {/* 2. CHẾ ĐỘ PHÁT CÁC BÀI SAU */}
          <div className="music-modal-section">
            <label className="music-section-label">
              <span className="section-title">🔀 Chế độ phát các bài tiếp theo:</span>
              <span className="section-desc">Sau khi bài mở đầu kết thúc, rạp sẽ tiếp tục phát như thế nào:</span>
            </label>
            <div className="music-mode-radios">
              <label className={`mode-card ${mode === "random" ? "is-selected" : ""}`}>
                <input
                  type="radio"
                  name="playMode"
                  value="random"
                  checked={mode === "random"}
                  onChange={() => setMode("random")}
                />
                <div className="mode-text">
                  <strong>🔀 Tự động ngẫu nhiên (Random / Shuffle)</strong>
                  <span>Tự động chọn ngẫu nhiên bài khác trong danh sách sau mỗi bài.</span>
                </div>
              </label>

              <label className={`mode-card ${mode === "sequence" ? "is-selected" : ""}`}>
                <input
                  type="radio"
                  name="playMode"
                  value="sequence"
                  checked={mode === "sequence"}
                  onChange={() => setMode("sequence")}
                />
                <div className="mode-text">
                  <strong>🔁 Lần lượt theo thứ tự (Sequence)</strong>
                  <span>Phát lần lượt từng bài theo thứ tự danh sách bên dưới từ trên xuống.</span>
                </div>
              </label>
            </div>
          </div>

          {/* 3. DANH SÁCH BÀI HÁT */}
          <div className="music-modal-section">
            <div className="music-section-label">
              <span className="section-title">📜 Danh sách bài hát ({tracks.length} bài):</span>
              <span className="section-desc">Sử dụng các nút mũi tên để xếp thứ tự phát hoặc đặt làm bài mở đầu.</span>
            </div>

            <div className="music-track-list">
              {tracks.map((t, idx) => {
                const isInitial = t.id === initialId;
                return (
                  <div key={t.id} className={`music-track-row ${isInitial ? "is-initial" : ""}`}>
                    <span className="track-number">{idx + 1}</span>
                    <span className="track-type-badge">{t.type === "audio" ? "MP3" : "YT"}</span>
                    <div className="track-info">
                      <strong>{t.title}</strong>
                      <span>{t.detail}</span>
                    </div>

                    {isInitial && <span className="initial-badge">⭐ Auto phát</span>}

                    <div className="track-row-actions">
                      <button
                        type="button"
                        className="track-btn"
                        onClick={() => onPreviewTrack(t)}
                        title="Nghe thử bài này"
                      >
                        ▶
                      </button>
                      <button
                        type="button"
                        className="track-btn"
                        disabled={isInitial}
                        onClick={() => setInitialId(t.id)}
                        title="Đặt làm bài auto phát"
                      >
                        ⭐
                      </button>
                      <button
                        type="button"
                        className="track-btn"
                        disabled={idx === 0}
                        onClick={() => moveTrack(idx, -1)}
                        title="Đẩy lên trên"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        className="track-btn"
                        disabled={idx === tracks.length - 1}
                        onClick={() => moveTrack(idx, 1)}
                        title="Đẩy xuống dưới"
                      >
                        ▼
                      </button>
                      <button
                        type="button"
                        className="track-btn is-delete"
                        onClick={() => removeTrack(idx)}
                        title="Xóa bài này"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. THÊM BÀI MỚI */}
          <div className="music-modal-section">
            <div className="music-section-label">
              <span className="section-title">➕ Thêm bài hát mới vào rạp:</span>
              <span className="section-desc">Hỗ trợ link video YouTube hoặc file âm thanh MP3.</span>
            </div>
            <form className="add-track-form" onSubmit={handleAddTrack}>
              <div className="form-grid">
                <input
                  type="text"
                  placeholder="Link YouTube (hoặc đường dẫn /music/ten-bai.mp3)"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  required
                />
                <input
                  type="text"
                  placeholder="Tên bài hát (VD: Báo thức T1)"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Nghệ sĩ / Ghi chú (VD: LoL CKTG 2024)"
                  value={newDetail}
                  onChange={(e) => setNewDetail(e.target.value)}
                />
              </div>
              <button type="submit" className="add-track-submit-btn">
                + Thêm vào danh sách
              </button>
            </form>
          </div>
        </div>

        <footer className="music-modal-footer">
          <button type="button" className="secondary-button" onClick={handleResetDefault}>
            🔄 Khôi phục mặc định
          </button>
          <div className="footer-right">
            <button type="button" className="site-action" onClick={onClose}>
              Đóng
            </button>
            <button
              type="button"
              className="primary-button music-save-btn"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Đang lưu..." : "💾 Lưu cấu hình (Toàn rạp)"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
