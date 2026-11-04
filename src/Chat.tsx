import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { MAX_CHAT_LENGTH, type ChatMessage } from "../shared/protocol.ts";

const STICK_TO_BOTTOM_PX = 80;

type Props = {
  messages: ChatMessage[];
  youId: string | null;
  onSend: (text: string) => void;
};

export function Chat({ messages, youId, onSend }: Props) {
  const [text, setText] = useState("");
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
            {message.admin && <em className="role-badge">Quản trị</em>} {message.text}
          </li>
        ))}
      </ol>
      <form className="chat-form" onSubmit={submit}>
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
