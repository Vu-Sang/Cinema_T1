import { useState, type SubmitEvent } from "react";
import type { RoomAccess, RoomAdminAction } from "../shared/protocol.ts";
import { changeRoomAccess } from "./api.ts";

type Props = {
  roomId: number;
  access: RoomAccess;
  onChanged?: () => void;
};

/** Open, close or schedule a room. The Worker checks the admin role again on every request. */
export function RoomAccessControls({ roomId, access, onChanged }: Props) {
  const [when, setWhen] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = (action: RoomAdminAction) => {
    setError(null);
    changeRoomAccess(roomId, action).then(
      () => onChanged?.(),
      (failure: Error) => setError(failure.message),
    );
  };

  const schedule = (event: SubmitEvent) => {
    event.preventDefault();
    run({ action: "schedule", opensAt: new Date(when).getTime() });
  };

  return (
    <div className="access-controls">
      <div className="access-row">
        {access.isOpen ? (
          <button type="button" className="tool-button" onClick={() => run({ action: "close" })}>
            Đóng phòng
          </button>
        ) : (
          <button type="button" className="tool-button is-primary" onClick={() => run({ action: "open" })}>
            Mở phòng ngay
          </button>
        )}
      </div>
      {!access.isOpen && (
        <form className="access-row" onSubmit={schedule}>
          <input type="datetime-local" aria-label="Thời điểm mở phòng" value={when} onChange={(event) => setWhen(event.target.value)} required />
          <button type="submit" className="tool-button">
            Hẹn giờ mở
          </button>
        </form>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
