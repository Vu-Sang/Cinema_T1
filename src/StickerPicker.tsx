import { useEffect, useRef, useState } from "react";
import { STICKERS, type Sticker } from "../shared/stickers.ts";

type Props = {
  onSelect: (sticker: Sticker) => void;
  onClose: () => void;
};

export function StickerPicker({ onSelect, onClose }: Props) {
  const [filter, setFilter] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const query = filter.trim().toLowerCase();
  const list = query
    ? STICKERS.filter((s) => s.name.toLowerCase().includes(query))
    : STICKERS;

  return (
    <section className="sticker-picker" ref={panelRef} role="dialog" aria-label="Gửi sticker lên rạp">
      <div className="sticker-picker-heading">
        <div className="sticker-picker-titles">
          <strong>Gửi sticker lên rạp</strong>
          <span>Nhấn vào sticker để gửi ngay</span>
        </div>
        <button
          type="button"
          className="sticker-picker-close"
          onClick={onClose}
          aria-label="Đóng bảng sticker"
          title="Đóng"
        >
          ✕
        </button>
      </div>

      <div className="sticker-picker-search">
        <input
          type="search"
          placeholder="Tìm sticker (Faker, T1, Doran...)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Tìm kiếm sticker"
        />
        {filter && (
          <button type="button" className="sticker-search-clear" onClick={() => setFilter("")}>
            ×
          </button>
        )}
      </div>

      <div className="sticker-asset-list" role="list">
        {list.length === 0 ? (
          <p className="sticker-empty">Không tìm thấy sticker nào phù hợp.</p>
        ) : (
          list.map((sticker) => (
            <button
              key={sticker.id}
              type="button"
              className="sticker-asset"
              aria-label={`Gửi sticker ${sticker.name}`}
              title={sticker.name}
              onClick={() => {
                onSelect(sticker);
              }}
            >
              <div className="sticker-asset-thumb">
                <img src={sticker.url} alt="" width={52} height={52} loading="lazy" decoding="async" />
              </div>
              <span className="sticker-asset-name">{sticker.name}</span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

