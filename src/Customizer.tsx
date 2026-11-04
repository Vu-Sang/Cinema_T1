import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { FACES, HAIR_COLORS, HAIR_STYLES, HEADWEAR, ITEMS, NAME_MAX, NAME_MIN, OUTFITS, randomLook, sanitizeName, SKIN_COLORS, type Look } from "../shared/look.ts";
import type { CharacterStage } from "./theater/stage.ts";

type Props = {
  name: string;
  look: Look;
  onSave: (name: string, look: Look) => Promise<void>;
  onClose: () => void;
};

function Chips<T extends string>({ label, options, value, onChange }: { label: string; options: readonly { id: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return (
    <fieldset className="option">
      <legend>{label}</legend>
      <div className="chips">
        {options.map((option) => (
          <button key={option.id} type="button" className="chip" aria-pressed={value === option.id} onClick={() => onChange(option.id)}>
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Swatches({ label, colors, value, onChange }: { label: string; colors: readonly string[]; value: number; onChange: (value: number) => void }) {
  return (
    <fieldset className="option">
      <legend>{label}</legend>
      <div className="chips">
        {colors.map((color, index) => (
          <button
            key={color}
            type="button"
            className="swatch"
            style={{ background: color }}
            aria-label={`${label} ${index + 1}`}
            aria-pressed={value === index}
            onClick={() => onChange(index)}
          />
        ))}
      </div>
    </fieldset>
  );
}

export function Customizer({ name: initialName, look: initialLook, onSave, onClose }: Props) {
  const [name, setName] = useState(initialName);
  const [look, setLook] = useState(initialLook);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<CharacterStage | null>(null);
  const latest = useRef({ name, look });
  latest.current = { name, look };

  const previewName = sanitizeName(name) ?? "T1";

  useEffect(() => {
    let cancelled = false;
    import("./theater/stage.ts").then(({ CharacterStage }) => {
      if (cancelled || !canvas.current) return;
      try {
        stage.current = new CharacterStage(canvas.current, { distance: 7.4, lookY: 0.95, sway: true });
      } catch {
        return; // No WebGL: the options still save, only the preview is missing.
      }
      stage.current.setPeople([{ id: "preview", name: sanitizeName(latest.current.name) ?? "T1", look: latest.current.look, x: 0 }]);
    });
    return () => {
      cancelled = true;
      stage.current?.dispose();
      stage.current = null;
    };
  }, []);

  useEffect(() => {
    stage.current?.setPeople([{ id: "preview", name: previewName, look, x: 0 }]);
  }, [previewName, look]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  const set = <K extends keyof Look>(key: K, value: Look[K]) => setLook((current) => ({ ...current, [key]: value }));

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (!sanitizeName(name)) {
      setError(`Tên cần có từ ${NAME_MIN} đến ${NAME_MAX} ký tự.`);
      return;
    }
    setSaving(true);
    setError(null);
    onSave(name, look).catch((failure: Error) => {
      setError(failure.message);
      setSaving(false);
    });
  };

  return (
    <div className="customizer" role="dialog" aria-modal="true" aria-label="Chọn nhân vật">
      <form className="customizer-panel" onSubmit={submit}>
        <div className="customizer-stage">
          <canvas ref={canvas} aria-hidden="true" />
          <button type="button" className="chip" onClick={() => setLook(randomLook())}>
            Chọn ngẫu nhiên
          </button>
        </div>
        <div className="customizer-options">
          <h2>Nhân vật của bạn</h2>
          <label className="option-name">
            Tên trong rạp
            <input value={name} maxLength={NAME_MAX} onChange={(event) => setName(event.target.value)} required />
          </label>
          <Chips label="Trang phục" options={OUTFITS} value={look.outfit} onChange={(value) => set("outfit", value)} />
          <Chips label="Cầm trên tay" options={ITEMS} value={look.item} onChange={(value) => set("item", value)} />
          <Chips label="Đội đầu" options={HEADWEAR} value={look.headwear} onChange={(value) => set("headwear", value)} />
          <Chips label="Hóa trang" options={FACES} value={look.face} onChange={(value) => set("face", value)} />
          <Chips label="Kiểu tóc" options={HAIR_STYLES} value={look.hairStyle} onChange={(value) => set("hairStyle", value)} />
          <Swatches label="Màu tóc" colors={HAIR_COLORS} value={look.hairColor} onChange={(value) => set("hairColor", value)} />
          <Swatches label="Màu da" colors={SKIN_COLORS} value={look.skin} onChange={(value) => set("skin", value)} />
          <label className="check">
            <input type="checkbox" checked={look.glasses} onChange={(event) => set("glasses", event.target.checked)} />
            Đeo kính tròn
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="customizer-actions">
            <button className="cta" type="submit" disabled={saving}>
              <span>Lưu nhân vật</span>
            </button>
            <button type="button" className="link-button" onClick={onClose}>
              Để sau
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
