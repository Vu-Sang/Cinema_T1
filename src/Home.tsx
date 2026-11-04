import { useCallback, useEffect, useRef, useState, type RefObject, type SubmitEvent } from "react";
import { DEFAULT_LOOK, NAME_MAX, type Look } from "../shared/look.ts";
import { CAPACITY, ROOM_IDS, type RoomListing, type User } from "../shared/protocol.ts";
import { fetchConfig, fetchRooms, saveProfile, signInAsGuest, signInForDev, signInWithGoogle, type AuthConfig } from "./api.ts";
import { Customizer } from "./Customizer.tsx";
import "./home.css";
import { RoomAccessControls } from "./RoomAccessControls.tsx";
import type { FlagMember, FlagStage } from "./theater/flags.ts";
import type { CharacterStage, StagePerson } from "./theater/stage.ts";

const ROOMS_REFRESH_MS = 15_000;

const MEMBERS: FlagMember[] = [
  { name: "Doran", photo: "/brand/players/doran.webp" },
  { name: "Oner", photo: "/brand/players/oner.webp" },
  { name: "Faker", photo: "/brand/players/faker.webp" },
  { name: "Peyz", photo: "/brand/players/peyz.webp" },
  { name: "Keria", photo: "/brand/players/keria.webp" },
];

const SECTIONS = [
  { id: "lich-chieu", label: "Lịch chiếu" },
  { id: "ve-rap", label: "Về rạp" },
  { id: "nhan-vat", label: "Nhân vật" },
];

const SLOGANS = [
  "Vào thở oxy cùng T đỏ",
  "Chưa tới ván 5 thì chưa hết",
  "Thắng cũng thở, thua cũng thở",
  "Bình oxy đã đầy, ghế còn trống",
  "Không toxic, chỉ thiếu oxy",
  "Tim yếu xin ngồi gần lối ra",
];

const STEPS = [
  { title: "Nhập tên, chọn nhân vật", detail: "Áo đấu hay đồ gánh xiếc, lightstick hay cờ T1. Không cần mật khẩu." },
  { title: "Chọn ghế trong khán phòng", detail: "Bấm vào ghế trống. Tên bạn in sau lưng áo cho cả hàng sau đọc." },
  { title: "Xem cùng cả rạp", detail: "Video phát đồng bộ cho mọi người. Đèn rạp tự tối khi trận bắt đầu." },
  { title: "Hết hơi thì đi thở oxy", detail: "Nhân vật bò tới bình gần nhất, thở 5 giây rồi đi bộ về ghế." },
];

const STATS = [
  { value: String(ROOM_IDS.length), label: "phòng chiếu" },
  { value: String(CAPACITY), label: "ghế mỗi phòng" },
  { value: "0đ", label: "tiền vé" },
];

/** The roster as circus characters, drawn fresh in the same style as the theatre, after T1's own 2026 circus poster. */
const LINEUP: StagePerson[] = [
  { id: "doran", name: "Doran", x: 1.6, z: 0.3, look: { skin: 0, hairColor: 0, hairStyle: "short", outfit: "clown", headwear: "none", item: "foam", face: "clown", glasses: false } },
  { id: "oner", name: "Oner", x: 0.85, z: 0.9, look: { skin: 1, hairColor: 0, hairStyle: "short", outfit: "acrobat", headwear: "tophat", item: "none", face: "none", glasses: false } },
  { id: "faker", name: "Faker", x: 0, z: -0.1, look: { skin: 0, hairColor: 0, hairStyle: "short", outfit: "ringmaster", headwear: "none", item: "cup", face: "none", glasses: true } },
  { id: "peyz", name: "Peyz", x: -0.85, z: -0.75, display: "breathing", look: { skin: 2, hairColor: 0, hairStyle: "spiky", outfit: "strongman", headwear: "none", item: "none", face: "mustache", glasses: false } },
  { id: "keria", name: "Keria", x: -1.6, z: 0.3, look: { skin: 0, hairColor: 1, hairStyle: "short", outfit: "mime", headwear: "beret", item: "lightstick", face: "mime", glasses: false } },
];

type RoomState = "playing" | "soon" | "scheduled" | "closed";
type Tab = "playing" | "upcoming" | "closed";

function roomState(room: RoomListing): RoomState {
  if (room.isOpen) return room.playback.videoId && room.playback.status === "playing" ? "playing" : "soon";
  return room.opensAt ? "scheduled" : "closed";
}

function roomTab(room: RoomListing): Tab {
  const state = roomState(room);
  return state === "playing" ? "playing" : state === "closed" ? "closed" : "upcoming";
}

function statusText(room: RoomListing): string {
  const state = roomState(room);
  if (state === "playing") return "Đang chiếu";
  if (state === "soon") return room.playback.videoId ? "Đã mở cửa, sắp chiếu" : "Đã mở cửa, chờ chọn trận";
  if (state === "scheduled" && room.opensAt) return `Mở cửa lúc ${formatTime(room.opensAt)}`;
  return "Đang đóng";
}

const formatTime = (at: number) =>
  new Date(at).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

type Props = {
  user: User | null;
  onUserChange: (user: User) => void;
  onEnter: (roomId: number) => void;
  onSignOut: () => void;
};

export function Home({ user, onUserChange, onEnter, onSignOut }: Props) {
  const [rooms, setRooms] = useState<RoomListing[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [chosenTab, setChosenTab] = useState<Tab | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);

  // Lights up the menu item for whichever section crosses the middle of the window.
  useEffect(() => {
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        setActiveSection(SECTIONS.find((section) => visible.has(section.id))?.id ?? null);
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    for (const section of SECTIONS) {
      const node = document.getElementById(section.id);
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, []);

  const load = useCallback(() => {
    fetchRooms().then(
      (next) => {
        setRooms(next);
        setLoadFailed(false);
      },
      () => setLoadFailed(true),
    );
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, ROOMS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const askForName = () => {
    nameInput.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    nameInput.current?.focus({ preventScroll: true });
  };

  const all = rooms ?? [];
  const admin = user?.admin === true;
  const count = (tab: Tab) => all.filter((room) => roomTab(room) === tab).length;
  // Until someone picks a tab, show what is on right now, falling back to what is next.
  const tab: Tab = chosenTab ?? (count("playing") > 0 || count("upcoming") === 0 ? "playing" : "upcoming");
  const shown = all.filter((room) => roomTab(room) === tab);
  const featured = all.find((room) => roomState(room) === "playing") ?? all.find((room) => room.isOpen) ?? all.find((room) => roomState(room) === "scheduled");

  const handleSave = async (name: string, look: Look) => {
    onUserChange(await saveProfile(name, look));
    setCustomizing(false);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "playing", label: "Đang chiếu" },
    { id: "upcoming", label: "Sắp chiếu" },
    ...(admin ? [{ id: "closed" as const, label: "Đang đóng" }] : []),
  ];

  return (
    <div className="home">
      <nav className="site-nav" aria-label="Trang chủ">
        <button className="site-logo" aria-label="Về đầu trang" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <img src="/brand/t1-logo.svg" alt="" width="72" height="29" />
        </button>
        <div className="site-links">
          {SECTIONS.map((section) => (
            <a key={section.id} href={`#${section.id}`} aria-current={activeSection === section.id ? "true" : undefined}>
              {section.label}
            </a>
          ))}
        </div>
        <div className="site-user">
          {user ? (
            <>
              <span className="site-name">
                {user.name}
                {admin && <em className="role-badge">Quản trị</em>}
              </span>
              <button className="site-action" onClick={onSignOut}>
                Đăng xuất
              </button>
            </>
          ) : (
            <button className="site-action is-primary" onClick={askForName}>
              Nhập tên vào rạp
            </button>
          )}
        </div>
      </nav>

      <header className="hero">
        <HeroFlags />
        <div className="hero-title">
          <h1>Rạp chiếu T1</h1>
          <p>Vào thở oxy cùng T đỏ</p>
        </div>

        <div className="quick-bar">
          <div className="quick-show">
            {featured ? (
              <>
                <Status room={featured} />
                <p className="quick-title">{featured.playback.title ?? `${featured.name}: trận đấu sẽ được công bố sau`}</p>
              </>
            ) : (
              <>
                <p className="status is-closed">{rooms ? "Chưa có suất chiếu" : "Đang tải lịch chiếu"}</p>
                <p className="quick-title">Rạp xem chung của fan T1. Suất mới sẽ hiện ở đây.</p>
              </>
            )}
          </div>
          <div className="quick-action">
            {user ? (
              <>
                <button className="site-action" onClick={() => setCustomizing(true)}>
                  Đổi nhân vật
                </button>
                {featured?.isOpen ? (
                  <button className="primary-button" onClick={() => onEnter(featured.id)}>
                    Vào {featured.name}
                  </button>
                ) : (
                  <a className="primary-button" href="#lich-chieu">
                    Xem lịch chiếu
                  </a>
                )}
              </>
            ) : (
              <EntryForm
                inputRef={nameInput}
                onSignedIn={(next) => {
                  onUserChange(next);
                  setCustomizing(true);
                }}
              />
            )}
          </div>
        </div>
      </header>

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {[...SLOGANS, ...SLOGANS, ...SLOGANS].map((slogan, index) => (
            <span key={index}>{slogan}</span>
          ))}
        </div>
      </div>

      <main>
        <section className="schedule" id="lich-chieu">
          <h2>Lịch chiếu</h2>
          <div className="tabs" role="group" aria-label="Lọc lịch chiếu">
            {tabs.map((item) => (
              <button key={item.id} className="tab" aria-pressed={tab === item.id} onClick={() => setChosenTab(item.id)}>
                {item.label}
                <span>{count(item.id)}</span>
              </button>
            ))}
          </div>
          {loadFailed && !rooms && <p className="form-error">Không tải được lịch chiếu. Trang sẽ tự thử lại.</p>}
          {rooms && shown.length === 0 && (
            <p className="schedule-empty">
              {tab === "playing" && "Chưa có rạp nào đang chiếu. Bình oxy vẫn đầy, chờ chút nhé."}
              {tab === "upcoming" && "Chưa có suất nào sắp chiếu."}
              {tab === "closed" && "Tất cả các phòng đều đang mở hoặc đã hẹn giờ."}
            </p>
          )}
          <div className="shows">
            {shown.map((room) => (
              <ShowCard key={room.id} room={room} user={user} onEnter={onEnter} askForName={askForName} onChanged={load} />
            ))}
          </div>
        </section>

        <section className="about" id="ve-rap">
          <div className="about-inner">
            <figure className="about-photo">
              <img src="/brand/t1-banner.webp" width="2048" height="808" loading="lazy" alt="Năm tuyển thủ T1 hóa trang thành các nhân vật gánh xiếc" />
              <figcaption>Đội hình chính thức của gánh xiếc T đỏ.</figcaption>
            </figure>
            <div>
              <h2>Một buổi xem ở rạp T1</h2>
              <ol className="steps">
                {STEPS.map((step) => (
                  <li key={step.title}>
                    <h3>{step.title}</h3>
                    <p>{step.detail}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <dl className="stats">
            {STATS.map((stat) => (
              <div key={stat.label}>
                <dd>{stat.value}</dd>
                <dt>{stat.label}</dt>
              </div>
            ))}
          </dl>
        </section>

        <section className="cast" id="nhan-vat">
          <div className="cast-copy">
            <h2>Vào rạp bằng nhân vật của bạn</h2>
            <p>Chọn trang phục, mũ, kiểu tóc và món đồ cầm tay. Đổi lúc nào cũng được, kể cả khi đang ngồi trong rạp.</p>
            {user ? (
              <button className="primary-button" onClick={() => setCustomizing(true)}>
                Đổi nhân vật
              </button>
            ) : (
              <button className="primary-button" onClick={askForName}>
                Nhập tên để bắt đầu
              </button>
            )}
          </div>
          <Lineup />
        </section>
      </main>

      <footer className="site-foot">
        <img src="/brand/t1-logo.svg" alt="" width="60" height="24" />
        <p className="site-foot-slogan">Chưa tới ván 5 thì chưa hết.</p>
        <p>Trang do người hâm mộ lập, không liên kết với T1 hay Riot Games. Video phát từ YouTube. Mẫu cờ và phong cảnh: LEARS.</p>
      </footer>

      {customizing && user && <Customizer name={user.name} look={user.look} onSave={handleSave} onClose={() => setCustomizing(false)} />}
    </div>
  );
}

function Status({ room }: { room: RoomListing }) {
  const state = roomState(room);
  return (
    <p className={`status is-${state}`}>
      {state === "playing" && <span className="live-dot" aria-hidden="true" />}
      {statusText(room)}
    </p>
  );
}

const FLAGS_PAUSED_KEY = "rap-t1-flags-paused";

function readFlagsPaused(): boolean {
  try {
    return localStorage.getItem(FLAGS_PAUSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Five waving member flags over the dark landscape. Without WebGL the landscape shows alone, with the names over it. */
function HeroFlags() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<FlagStage | null>(null);
  const [plain, setPlain] = useState(false);
  const [paused, setPaused] = useState(readFlagsPaused);

  useEffect(() => {
    let cancelled = false;
    import("./theater/flags.ts").then(({ FlagStage }) => {
      if (cancelled || !canvas.current) return;
      try {
        stage.current = new FlagStage(canvas.current);
      } catch {
        setPlain(true);
        return;
      }
      stage.current.setPaused(readFlagsPaused());
      stage.current.setMembers(MEMBERS).catch(() => setPlain(true));
    });
    return () => {
      cancelled = true;
      stage.current?.dispose();
      stage.current = null;
    };
  }, []);

  const togglePaused = () => {
    const next = !paused;
    setPaused(next);
    stage.current?.setPaused(next);
    try {
      localStorage.setItem(FLAGS_PAUSED_KEY, next ? "1" : "0");
    } catch {
      // The choice simply will not be remembered next visit.
    }
  };

  return (
    <div className={`hero-banner${plain ? " is-plain" : ""}`}>
      <img src="/brand/t1-hero-bg.webp" width="2600" height="745" alt="" />
      <canvas ref={canvas} aria-hidden="true" />
      <ul className="hero-members">
        {MEMBERS.map((member) => (
          <li key={member.name}>{member.name}</li>
        ))}
      </ul>
      {!plain && (
        <button className="flags-toggle" onClick={togglePaused}>
          {paused ? "Cho cờ bay" : "Dừng cờ bay"}
        </button>
      )}
    </div>
  );
}

function Lineup() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let stage: CharacterStage | undefined;
    import("./theater/stage.ts").then(({ CharacterStage }) => {
      if (cancelled || !canvas.current) return;
      try {
        stage = new CharacterStage(canvas.current, { distance: 7.8, lookY: 0.92, minAspect: 1.45, sway: false, tanks: [-1.25, -0.75, 2.25], liveliness: true });
      } catch {
        return; // No WebGL: the section still reads without the characters.
      }
      stage.setPeople(LINEUP);
    });
    return () => {
      cancelled = true;
      stage?.dispose();
    };
  }, []);

  return <canvas ref={canvas} className="cast-stage" aria-hidden="true" />;
}

type CardProps = {
  room: RoomListing;
  user: User | null;
  onEnter: (roomId: number) => void;
  askForName: () => void;
  onChanged: () => void;
};

function ShowCard({ room, user, onEnter, askForName, onChanged }: CardProps) {
  const { videoId } = room.playback;
  const canEnter = room.isOpen || user?.admin === true;
  const filled = Math.min(100, (room.viewers / room.capacity) * 100);

  return (
    <article className="show">
      <div className="show-art">
        <img src={videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "/brand/cup.jpg"} alt="" loading="lazy" />
        <span className="show-room">{room.name}</span>
      </div>
      <div className="show-body">
        <Status room={room} />
        <h3>{room.playback.title ?? "Trận đấu sẽ được công bố sau"}</h3>
        <div className="seat-meter">
          <div className="seat-meter-bar" aria-hidden="true">
            <span style={{ width: `${filled}%` }} />
          </div>
          <p>
            {room.viewers} / {room.capacity} ghế có người
          </p>
        </div>
        {canEnter ? (
          <button className="primary-button" onClick={() => (user ? onEnter(room.id) : askForName())}>
            {user ? (room.isOpen ? "Vào rạp" : "Vào chuẩn bị") : "Nhập tên để vào"}
          </button>
        ) : (
          <p className="show-wait">Chưa mở cửa</p>
        )}
        {user?.admin && <RoomAccessControls roomId={room.id} access={room} onChanged={onChanged} />}
      </div>
    </article>
  );
}

function EntryForm({ inputRef, onSignedIn }: { inputRef: RefObject<HTMLInputElement | null>; onSignedIn: (user: User) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<AuthConfig | null>(null);

  useEffect(() => {
    fetchConfig().then(setConfig, () => {});
  }, []);

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    setError(null);
    signInAsGuest(name, DEFAULT_LOOK).then(onSignedIn, (failure: Error) => setError(failure.message));
  };

  const showAdmin = config && (config.googleClientId || config.devLogin);

  return (
    <div className="entry">
      <form className="entry-form" onSubmit={submit}>
        <input
          ref={inputRef}
          aria-label="Tên của bạn trong rạp"
          placeholder="Tên của bạn trong rạp"
          value={name}
          maxLength={NAME_MAX}
          onChange={(event) => setName(event.target.value)}
          required
        />
        <button className="primary-button" type="submit">
          Chọn nhân vật
        </button>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {showAdmin && (
        <details className="entry-admin">
          <summary>Đăng nhập quản trị</summary>
          {config.googleClientId && <GoogleButton clientId={config.googleClientId} onSignedIn={onSignedIn} onError={setError} />}
          {config.devLogin && (
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setError(null);
                signInForDev(name).then(onSignedIn, (failure: Error) => setError(failure.message));
              }}
            >
              Vào quyền quản trị với tên trên (chỉ khi chạy thử trên máy)
            </button>
          )}
        </details>
      )}
    </div>
  );
}

function GoogleButton({ clientId, onSignedIn, onError }: { clientId: string; onSignedIn: (user: User) => void; onError: (message: string | null) => void }) {
  const target = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => {
      window.google?.accounts.id.initialize({
        client_id: clientId,
        callback: ({ credential }) => {
          signInWithGoogle(credential).then(onSignedIn, (failure: Error) => onError(failure.message));
        },
      });
      if (target.current) {
        window.google?.accounts.id.renderButton(target.current, { theme: "filled_black", size: "large", shape: "pill", locale: "vi" });
      }
    };
    script.onerror = () => onError("Không tải được đăng nhập Google. Hãy kiểm tra mạng rồi tải lại trang.");
    document.head.append(script);
    return () => script.remove();
  }, [clientId, onSignedIn, onError]);

  return <div ref={target} className="google-button" />;
}
