import { memo, type CSSProperties } from "react";
import { ROWS, SEATS_PER_ROW, seatLabel, type Seats } from "../shared/protocol.ts";

type Props = {
  seats: Seats;
  youId: string | null;
  onPick: (seat: number | null) => void;
};

const rowName = (row: number) => String.fromCharCode(65 + row);
/** First seat of the middle and right blocks; grid tracks match .seat-row in styles.css. */
const BLOCK_START: Record<number, number> = { 3: 6, 7: 11 };

export const SeatMap = memo(function SeatMap({ seats, youId, onPick }: Props) {
  const mine = Object.entries(seats).find(([, person]) => person.id === youId)?.[0];
  const mySeat = mine ? Number(mine) : null;

  return (
    <section className="seat-area" aria-label="Sơ đồ ghế">
      <div className="seat-caption">
        <p>{mySeat ? `Bạn đang ngồi ghế ${seatLabel(mySeat)}` : "Chọn một ghế còn trống để ngồi"}</p>
        {mySeat && (
          <button className="link-button" onClick={() => onPick(null)}>
            Rời ghế
          </button>
        )}
      </div>
      <div className="seat-map">
        {Array.from({ length: ROWS }, (_, row) => (
          <div className="seat-row" key={row} style={{ "--row": row } as CSSProperties}>
            <span className="row-name" aria-hidden="true">
              {rowName(row)}
            </span>
            {Array.from({ length: SEATS_PER_ROW }, (_, column) => {
              const seat = row * SEATS_PER_ROW + column + 1;
              const person = seats[seat];
              const isMine = person?.id === youId && youId !== null;
              const edge = Math.abs(column - (SEATS_PER_ROW - 1) / 2) / ((SEATS_PER_ROW - 1) / 2);
              const state = isMine ? "của bạn" : person ? `có ${person.name} ngồi` : "còn trống";
              return (
                <button
                  key={seat}
                  className={`seat${isMine ? " is-mine" : person ? " is-taken" : ""}`}
                  style={{ "--arc": edge * edge, gridColumnStart: BLOCK_START[column] } as CSSProperties}
                  disabled={Boolean(person) && !isMine}
                  aria-label={`Ghế ${seatLabel(seat)}, ${state}`}
                  title={person ? person.name : seatLabel(seat)}
                  onClick={() => onPick(isMine ? null : seat)}
                />
              );
            })}
            <span className="row-name" aria-hidden="true">
              {rowName(row)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
});
