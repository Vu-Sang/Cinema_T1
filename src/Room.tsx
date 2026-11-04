import { useCallback, useEffect, useMemo, useRef, useState, type SubmitEvent } from "react";
import type { Look } from "../shared/look.ts";
import { CAPACITY, MAX_CHAT_LENGTH, REACTIONS, roomName, type ActionKind, type ChatMessage, type ReactionKind, type User } from "../shared/protocol.ts";
import { AdminConsole } from "./AdminConsole.tsx";
import { saveProfile } from "./api.ts";
import { Chat } from "./Chat.tsx";
import { Customizer } from "./Customizer.tsx";
import { REACTION_LABELS, ReactionIcon } from "./ReactionIcon.tsx";
import { Screen, type PlayerTick } from "./Screen.tsx";
import { SeatMap } from "./SeatMap.tsx";
import { Theater, type TheaterHandle } from "./Theater.tsx";
import { useRoom } from "./useRoom.ts";

const ACTION_BUTTONS: { kind: ActionKind; label: string; hint: string }[] = [
  { kind: "dance", label: "Quẩy lên", hint: "Đứng dậy nhảy và giơ tay cổ vũ" },
  { kind: "jump", label: "Nhảy", hint: "Bật nhảy tại chỗ" },
  { kind: "stand", label: "Đứng lên", hint: "Đứng dậy một lát rồi ngồi xuống" },
  { kind: "oxygen", label: "Thở ôxy", hint: "Bò tới bình ôxy gần nhất, thở 5 giây rồi đi về ghế" },
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
  const events = useMemo(
    () => ({
      onAction: (userId: string, kind: ActionKind) => theater.current?.playAction(userId, kind),
      onReaction: (userId: string, kind: ReactionKind) => theater.current?.showReaction(userId, kind),
      onLiveChat: (message: ChatMessage) => theater.current?.showBubble(message),
    }),
    [],
  );
  const { connection, you, playback, seats, viewers, messages, led, access, notice, send, serverNow } = useRoom(roomId, onSignedOut, events);
  const [tick, setTick] = useState<PlayerTick>({ position: 0, duration: 0 });
  const [panel, setPanel] = useState<Panel | null>(null);
  const [customizing, setCustomizing] = useState(false);
  const [cheering, setCheering] = useState(false);
  const [draft, setDraft] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLElement>(null);

  const youId = you?.id ?? null;
  const admin = you?.admin === true;
  const seated = useMemo(() => Object.values(seats).some((person) => person.id === youId), [seats, youId]);

  const pickSeat = useCallback((seat: number | null) => send({ t: "seat", seat }), [send]);
  const clickSeat = useCallback(
    (seat: number) => {
      if (!seats[seat]) send({ t: "seat", seat });
    },
    [seats, send],
  );
  const sendChat = useCallback((text: string) => send({ t: "chat", text }), [send]);

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
          {panel === "chat" && <Chat messages={messages} youId={youId} onSend={sendChat} />}
          {panel === "seats" && <SeatMap seats={seats} youId={youId} onPick={pickSeat} />}
          {panel === "admin" && playback && access && <AdminConsole roomId={roomId} access={access} playback={playback} led={led} tick={tick} send={send} />}
        </section>
      )}

      {cheering && (
        <div className="reaction-bar" role="group" aria-label="Biểu tượng cổ vũ">
          {REACTIONS.map((kind) => (
            <button
              key={kind}
              className="reaction-button"
              aria-label={REACTION_LABELS[kind]}
              title={seated ? REACTION_LABELS[kind] : "Hãy chọn ghế trước"}
              disabled={!seated}
              onClick={() => send({ t: "react", kind })}
            >
              <ReactionIcon kind={kind} />
            </button>
          ))}
        </div>
      )}

      <nav className="dock" ref={dockRef} aria-label="Thao tác trong rạp">
        <div className="dock-group">
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
          <button className="dock-button is-cheer" aria-pressed={cheering} onClick={() => setCheering((current) => !current)}>
            Cổ vũ
          </button>
        </div>
        <form className="dock-chat" onSubmit={submitDraft}>
          <input aria-label="Tin nhắn" placeholder="Nhắn cho cả rạp" value={draft} maxLength={MAX_CHAT_LENGTH} onChange={(event) => setDraft(event.target.value)} />
        </form>
        <div className="dock-group">
          <button className="dock-button" aria-pressed={panel === "chat"} onClick={() => togglePanel("chat")}>
            Trò chuyện
          </button>
          <button className="dock-button" aria-pressed={panel === "seats"} onClick={() => togglePanel("seats")}>
            Sơ đồ ghế
          </button>
          <button className="dock-button" onClick={() => setCustomizing(true)}>
            Nhân vật
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
