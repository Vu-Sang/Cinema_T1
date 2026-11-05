import { useCallback, useEffect, useMemo, useRef, useState, type SubmitEvent } from "react";
import type { Look } from "../shared/look.ts";
import { CAPACITY, MAX_CHAT_LENGTH, REACTIONS, roomName, type ActionKind, type ChatMessage, type PrankTool, type ReactionKind, type Sticker, type User } from "../shared/protocol.ts";
import { AdminConsole } from "./AdminConsole.tsx";
import { saveProfile } from "./api.ts";
import { Chat } from "./Chat.tsx";
import { Customizer } from "./Customizer.tsx";
import { REACTION_LABELS, ReactionIcon, PrankIcon } from "./ReactionIcon.tsx";
import { Screen, type PlayerTick } from "./Screen.tsx";
import { SeatMap } from "./SeatMap.tsx";
import { StickerPicker } from "./StickerPicker.tsx";
import { Theater, type TheaterHandle } from "./Theater.tsx";
import { useRoom } from "./useRoom.ts";

const PRANK_BUTTONS: { tool: PrankTool; label: string; hint: string; cast: string }[] = [
  { tool: "throw", label: "Ném đầu Ati", hint: "Ném đầu Ati vào các tuyển thủ trên sân khấu", cast: "bấm để ném đầu Ati" },
  { tool: "punch", label: "Đấm", hint: "Đấm nhẹ một phát cho vui", cast: "bấm để đấm" },
  { tool: "tickle", label: "Cù léc", hint: "Cù léc cho họ cười", cast: "bấm để cù léc" },
];

const ACTION_BUTTONS: { kind: ActionKind; label: string; hint: string }[] = [
  { kind: "dance", label: "Quẩy lên", hint: "Đứng dậy nhảy và giơ tay cổ vũ" },
  { kind: "jump", label: "Nhảy", hint: "Bật nhảy tại chỗ" },
  { kind: "stand", label: "Đứng lên", hint: "Đứng dậy một lát rồi ngồi xuống" },
  { kind: "oxygen", label: "Thở ôxy", hint: "Bò ra bình ôxy ở lối đi, kẹp ống thở vào miệng, hít sâu vài hơi rồi đi bộ về ghế" },
];

type Panel = "chat" | "seats" | "admin";

type Props = {
  roomId: number;
  user: User;
  onUserChange: (user: User) => void;
  onLeave: () => void;
  onSignOut: () => void;
  onSignedOut: () => void;
};

export function Room({ roomId, user, onUserChange, onLeave, onSignOut, onSignedOut }: Props) {
  const theater = useRef<TheaterHandle>(null);
  const youIdRef = useRef<string | null>(null);
  const events = useMemo(
    () => ({
      onAction: (userId: string, kind: ActionKind) => theater.current?.playAction(userId, kind),
      onReaction: (userId: string, kind: ReactionKind) => {
        if (userId !== youIdRef.current) theater.current?.showReaction(userId, kind);
      },
      onLiveChat: (message: ChatMessage) => theater.current?.showBubble(message),
      onPrank: (userId: string, tool: PrankTool, target: number) => theater.current?.prank(userId, tool, target),
    }),
    [],
  );
  const { connection, you, playback, seats, viewers, messages, led, access, notice, send, serverNow } = useRoom(roomId, onSignedOut, events);
  youIdRef.current = you?.id ?? null;
  const [tick, setTick] = useState<PlayerTick>({ position: 0, duration: 0 });
  const [panel, setPanel] = useState<Panel | null>(null);
  const [customizing, setCustomizing] = useState(false);
  const [cheering, setCheering] = useState(false);
  const [pranking, setPranking] = useState(false);
  const [prankTool, setPrankTool] = useState<PrankTool>("throw");
  const [showStickers, setShowStickers] = useState(false);
  const [draft, setDraft] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLElement>(null);
  const prankRef = useRef<HTMLDivElement>(null);
  const cheerRef = useRef<HTMLDivElement>(null);
  const stickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pranking) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (prankRef.current && !prankRef.current.contains(target) && !dockRef.current?.contains(target)) {
        setPranking(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [pranking]);

  useEffect(() => {
    if (!cheering) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (cheerRef.current && !cheerRef.current.contains(target) && !dockRef.current?.contains(target)) {
        setCheering(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [cheering]);

  useEffect(() => {
    if (!showStickers) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (stickerRef.current && !stickerRef.current.contains(target) && !dockRef.current?.contains(target)) {
        setShowStickers(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [showStickers]);

  const youId = you?.id ?? null;
  const admin = you?.admin === true;
  const seated = useMemo(() => Object.values(seats).some((person) => person.id === youId), [seats, youId]);

  const handleSendReaction = useCallback(
    (kind: ReactionKind) => {
      send({ t: "react", kind });
      theater.current?.showReaction(youId ?? "you", kind);
    },
    [send, youId],
  );

  const handleSendSticker = useCallback(
    (sticker: Sticker) => {
      send({ t: "chat", text: `[Sticker: ${sticker.name}]`, stickerId: sticker.id });
      setShowStickers(false);
    },
    [send],
  );

  const pickSeat = useCallback((seat: number | null) => send({ t: "seat", seat }), [send]);
  const clickSeat = useCallback(
    (seat: number) => {
      if (!seats[seat]) send({ t: "seat", seat });
    },
    [seats, send],
  );
  const sendChat = useCallback((text: string, stickerId?: string) => send({ t: "chat", text, stickerId }), [send]);

  useEffect(() => {
    if (!panel) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPanel(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [panel]);

  const submitDraft = (event: SubmitEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    sendChat(text);
    setDraft("");
  };

  const handleSaveCharacter = async (name: string, look: Look) => {
    const saved = await saveProfile(name, look);
    onUserChange(saved);
    send({ t: "profile", name: saved.name, look: saved.look });
    setCustomizing(false);
  };

  if (connection === "full" || connection === "closed") {
    const full = connection === "full";
    return (
      <div className="room-message">
        <h1>{full ? `${roomName(roomId)} đã kín ${CAPACITY} ghế.` : `${roomName(roomId)} đang đóng cửa.`}</h1>
        <p>{full ? "Hãy thử phòng khác hoặc quay lại khi có người rời rạp." : "Quản trị viên chưa mở phòng này. Hãy xem các rạp khác ở trang chủ."}</p>
        <button className="cta" onClick={onLeave}>
          <span>Về trang chủ</span>
        </button>
      </div>
    );
  }

  const togglePanel = (next: Panel) => setPanel((current) => (current === next ? null : next));

  return (
    <div className="room">
      <Theater
        ref={theater}
        seats={seats}
        youId={youId}
        lightsOn={playback?.status !== "playing"}
        topRef={stageRef}
        bottomRef={dockRef}
        onPick={clickSeat}
        onCastClick={(target) => send({ t: "prank", tool: prankTool, target })}
        castHint={PRANK_BUTTONS.find((item) => item.tool === prankTool)?.cast ?? ""}
      />

      <header className="room-top">
        <button className="logo-button" onClick={onLeave} aria-label="Về trang chủ">
          <img src="/brand/t1-logo.svg" alt="" width="58" height="23" />
        </button>
        <p className="room-pill">
          <span>{roomName(roomId)}</span>
          <span className="room-pill-count">
            {viewers} / {CAPACITY} ghế
          </span>
          {access && !access.isOpen && <span className="room-closed">Chưa mở cho khán giả</span>}
          {connection === "connecting" && <span className="room-reconnect">Đang kết nối lại</span>}
        </p>
        <div className="room-user">
          {you && (
            <span>
              {you.name}
              {admin && <em className="role-badge">Quản trị</em>}
            </span>
          )}
          <button className="link-button" onClick={onSignOut}>
            Đăng xuất
          </button>
        </div>
      </header>

      <div className="stage" ref={stageRef}>
        {playback && <Screen playback={playback} led={led} serverNow={serverNow} onTick={setTick} />}
      </div>

      {!seated && connection === "open" && !cheering && <p className="seat-hint">Bấm vào một ghế trống trong rạp để ngồi</p>}

      {panel && (
        <section className="drawer" aria-label="Bảng phụ">
          <button className="link-button drawer-close" onClick={() => setPanel(null)}>
            Đóng
          </button>
          {panel === "chat" && <Chat messages={messages} youId={youId} onSend={sendChat} onSendSticker={handleSendSticker} />}
          {panel === "seats" && <SeatMap seats={seats} youId={youId} onPick={pickSeat} />}
          {panel === "admin" && playback && access && <AdminConsole roomId={roomId} access={access} playback={playback} led={led} tick={tick} send={send} />}
        </section>
      )}

      {showStickers && (
        <div className="dock-sticker-modal" ref={stickerRef}>
          <StickerPicker onSelect={handleSendSticker} onClose={() => setShowStickers(false)} />
        </div>
      )}

      {cheering && (
        <div className="reaction-bar" ref={cheerRef} role="group" aria-label="Biểu tượng cổ vũ">
          {REACTIONS.map((kind) => (
            <button
              key={kind}
              className="reaction-button"
              aria-label={REACTION_LABELS[kind]}
              title={REACTION_LABELS[kind]}
              onClick={() => handleSendReaction(kind)}
            >
              <ReactionIcon kind={kind} />
            </button>
          ))}
        </div>
      )}

      {pranking && (
        <div className="reaction-bar prank-bar" ref={prankRef} role="group" aria-label="Chơi với tuyển thủ T1">
          {PRANK_BUTTONS.map((item) => (
            <button
              key={item.tool}
              className="reaction-button prank-button"
              aria-label={item.label}
              aria-pressed={prankTool === item.tool}
              title={item.label}
              onClick={() => setPrankTool(item.tool)}
            >
              <PrankIcon tool={item.tool} />
            </button>
          ))}
        </div>
      )}

      <nav className="dock" ref={dockRef} aria-label="Thao tác trong rạp">
        <div className="dock-group" role="group" aria-label="Hành động">
          {ACTION_BUTTONS.map((action) => (
            <button
              key={action.kind}
              className="dock-button"
              title={seated ? action.hint : "Hãy chọn ghế trước"}
              disabled={!seated}
              onClick={() => send({ t: "action", kind: action.kind })}
            >
              {action.label}
            </button>
          ))}
          <button
            className="dock-button is-cheer"
            aria-pressed={cheering}
            onClick={() => {
              setCheering((current) => !current);
              setPranking(false);
              setShowStickers(false);
            }}
          >
            Cổ vũ
          </button>
          <button
            className="dock-button is-prank"
            aria-pressed={pranking}
            title={`Chơi với tuyển thủ T1: ${PRANK_BUTTONS.find((p) => p.tool === prankTool)?.label ?? ""} (Bấm để chọn trò)`}
            onClick={() => {
              setPranking((current) => !current);
              setCheering(false);
              setShowStickers(false);
            }}
          >
            Chơi với T1
          </button>
        </div>

        <form className="dock-chat" onSubmit={submitDraft}>
          <button
            type="button"
            className={`dock-sticker-trigger${showStickers ? " is-active" : ""}`}
            title="Gửi sticker lên rạp"
            aria-label="Gửi sticker lên rạp"
            aria-pressed={showStickers}
            onClick={(e) => {
              e.stopPropagation();
              setShowStickers((v) => !v);
              setCheering(false);
              setPranking(false);
            }}
          >
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
          </button>
          <input aria-label="Tin nhắn" placeholder="Nhắn cho cả rạp..." value={draft} maxLength={MAX_CHAT_LENGTH} onChange={(event) => setDraft(event.target.value)} />
        </form>

        <div className="dock-group" role="group" aria-label="Tiện ích">
          <button className="dock-button" aria-pressed={panel === "chat"} onClick={() => togglePanel("chat")}>
            Trò chuyện
          </button>
          <button className="dock-button" aria-pressed={panel === "seats"} onClick={() => togglePanel("seats")}>
            Sơ đồ ghế
          </button>
          <button className="dock-button" onClick={() => setCustomizing(true)} title="Tùy biến nhân vật, trang phục (Lên đồ)">
            Lên đồ
          </button>
          {admin && (
            <button className="dock-button is-admin" aria-pressed={panel === "admin"} onClick={() => togglePanel("admin")}>
              Điều khiển
            </button>
          )}
        </div>
      </nav>

      {notice && (
        <p className="notice" role="alert">
          {notice}
        </p>
      )}

      {customizing && <Customizer name={user.name} look={user.look} onSave={handleSaveCharacter} onClose={() => setCustomizing(false)} />}
    </div>
  );
}
