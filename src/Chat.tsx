import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { MAX_CHAT_LENGTH, type ChatMessage, type Sticker } from "../shared/protocol.ts";
import { StickerPicker } from "./StickerPicker.tsx";

const STICK_TO_BOTTOM_PX = 80;

type Props = {
  messages: ChatMessage[];
  youId: string | null;
  onSend: (text: string) => void;
  onSendSticker?: (sticker: Sticker) => void;
};

export function Chat({ messages, youId, onSend, onSendSticker }: Props) {
  const [text, setText] = useState("");
  const [showStickers, setShowStickers] = useState(false);
  const log = useRef<HTMLOListElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    if (stick.current && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages]);

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
    stick.current = true;
  };

  const handlePickSticker = (sticker: Sticker) => {
    if (onSendSticker) {
      onSendSticker(sticker);
    }
    setShowStickers(false);
  };

  return (
    <aside className="chat" aria-label="Trò chuyện">
      <h2>Trò chuyện</h2>
      <ol
        className="chat-log"
        ref={log}
        aria-live="polite"
        onScroll={(event) => {
          const list = event.currentTarget;
          stick.current = list.scrollHeight - list.scrollTop - list.clientHeight < STICK_TO_BOTTOM_PX;
        }}
      >
        {messages.length === 0 && <li className="chat-empty">Chưa có ai nói gì. Hãy mở lời đầu tiên.</li>}
        {messages.map((message) => (
          <li key={message.id} className={message.userId === youId ? "is-you" : undefined}>
            <strong>{message.name}</strong>
            {message.admin && <em className="role-badge">Quản trị</em>}{" "}
            {message.sticker ? (
              <div className="chat-msg-sticker">
                <img
                  src={message.sticker.url}
                  alt={`Sticker: ${message.sticker.name}`}
                  className="chat-sticker-img"
                  loading="lazy"
                  decoding="async"
                />
                <span className="chat-sticker-caption">{message.sticker.name}</span>
              </div>
            ) : (
              message.text
            )}
          </li>
        ))}
      </ol>

      {showStickers && (
        <div className="chat-drawer-sticker-popup">
          <StickerPicker onSelect={handlePickSticker} onClose={() => setShowStickers(false)} />
        </div>
      )}

      <form className="chat-form" onSubmit={submit}>
        <button
          type="button"
          className={`chat-sticker-trigger${showStickers ? " is-active" : ""}`}
          title="Chọn sticker để gửi"
          aria-label="Chọn sticker để gửi"
          onClick={() => setShowStickers((v) => !v)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" />
            <line x1="15" y1="9" x2="15.01" y2="9" />
          </svg>
        </button>
        <input
          aria-label="Tin nhắn"
          placeholder="Nhắn cho cả rạp"
          value={text}
          maxLength={MAX_CHAT_LENGTH}
          onChange={(event) => setText(event.target.value)}
        />
        <button className="tool-button" type="submit">
          Gửi
        </button>
      </form>
    </aside>
  );
}
