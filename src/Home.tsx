import { useCallback, useEffect, useRef, useState } from "react";
import type { Look } from "../shared/look.ts";
import { CAPACITY, ROOM_IDS, type RoomListing, type User } from "../shared/protocol.ts";
import { fetchConfig, fetchRooms, saveProfile, signInForDev, signInWithGoogle, type AuthConfig } from "./api.ts";
import { Ati } from "./Ati.tsx";
import { Customizer } from "./Customizer.tsx";
import "./home.css";
import { MusicPlayer } from "./MusicPlayer.tsx";
import { RoomAccessControls } from "./RoomAccessControls.tsx";
import { fetchAuthProviders, type AuthProviders } from "./supabase.ts";
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
  { title: "Hết hơi thì đi thở oxy", detail: "Nhân vật bò ra bình ôxy ở lối đi, kẹp ống thở vào miệng, hít sâu vài hơi rồi đi bộ về ghế." },
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
  notice: string | null;
  onUserChange: (user: User) => void;
  onEnter: (roomId: number) => void;
  onSignOut: () => void;
};

export function Home({ user, notice, onUserChange, onEnter, onSignOut }: Props) {
  const [rooms, setRooms] = useState<RoomListing[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [chosenTab, setChosenTab] = useState<Tab | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  // Mở popup chọn nhân vật và tên sau khi đăng nhập Gmail (hoặc khi là tài khoản mới)
  useEffect(() => {
    if (user && (sessionStorage.getItem("open_customizer") === "true" || user.name === "Khách")) {
      sessionStorage.removeItem("open_customizer");
      setCustomizing(true);
    }
  }, [user]);

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

  const askToSignIn = () => {
    sessionStorage.setItem("open_customizer", "true");
    signInWithGoogle().catch(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  const all = rooms ?? [];
  const admin = user?.admin === true;
  const count = (tab: Tab) => all.filter((room) => roomTab(room) === tab).length;
  // Until someone picks a tab, show what is on right now, falling back to what is next.
  const tab: Tab = chosenTab ?? (count("playing") > 0 || count("upcoming") === 0 ? "playing" : "upcoming");
  const shown = all.filter((room) => roomTab(room) === tab);
  // Chọn phòng HOT NHẤT (phòng đang mở có lượng người xem đông nhất)
  const openRooms = all.filter((room) => room.isOpen);
  const featured =
    (openRooms.length > 0
      ? [...openRooms].sort((a, b) => b.viewers - a.viewers)[0]
      : all.find((room) => roomState(room) === "scheduled") ?? all[0]) ?? null;

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
            <button className="site-action is-primary" onClick={askToSignIn}>
              Đăng nhập Gmail
            </button>
          )}
        </div>
      </nav>

      <header className="hero">
        <HeroFlags />
        <div className="hero-title">
          <h1>View Party T1</h1>
          <p>Vào thở oxy cùng T đỏ</p>
        </div>

        <div className="screening-wrap">
          <div className="screening-peek">
            <Ati pose="wave" delay={1.6} />
          </div>
          <div className="screening">
            <div className="screening-stub">
              {featured ? (
                <>
                  <span>Phòng</span>
                  <strong>{String(featured.id).padStart(2, "0")}</strong>
                </>
              ) : (
                <img src="/brand/t1-logo.svg" alt="" width="56" height="23" />
              )}
            </div>
            <div className="screening-main">
              {featured ? (
                <>
                  <Status room={featured} />
                  <p className="screening-title">
                    {featured.playback.title ?? (featured.isOpen ? `${featured.name}: Trận đấu sẽ được công bố sau` : "Rạp đang chuẩn bị suất chiếu tiếp theo")}
                  </p>
                  {featured.isOpen && <SeatMeter room={featured} />}
                </>
              ) : (
                <>
                  <p className="status">View Party T1</p>
                  <p className="screening-title">{rooms ? "Chưa có suất chiếu nào mở cửa" : "Đang tải lịch chiếu..."}</p>
                </>
              )}
            </div>
            <div className="screening-action">
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
                  notice={notice}
                  onSignedIn={(next) => {
                    onUserChange(next);
                    setCustomizing(true);
                  }}
                />
              )}
            </div>
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
            <div className="schedule-empty">
              <Ati pose="sleep" className="empty-ati" />
              <p>
                {tab === "playing" && "Chưa có rạp nào đang chiếu. Bình oxy vẫn đầy, chờ chút nhé."}
                {tab === "upcoming" && "Chưa có suất nào sắp chiếu."}
                {tab === "closed" && "Tất cả các phòng đều đang mở hoặc đã hẹn giờ."}
              </p>
            </div>
          )}
          <div className="shows">
            {shown.map((room) => (
              <ShowCard key={room.id} room={room} user={user} onEnter={onEnter} askToSignIn={askToSignIn} onChanged={load} />
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
              <h2>Một buổi xem tại View Party T1</h2>
              <ol className="steps">
                {STEPS.map((step, index) => (
                  <li key={step.title} className={index === STEPS.length - 1 ? "has-ati" : undefined}>
                    <h3>{step.title}</h3>
                    <p>{step.detail}</p>
                    {index === STEPS.length - 1 && <Ati pose="mask" className="step-ati" delay={0.8} />}
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
              <button className="primary-button" onClick={askToSignIn}>
                Đăng nhập để chọn nhân vật
              </button>
            )}
          </div>
          <Lineup />
        </section>
      </main>

      <footer className="site-foot">
        <Ati pose="cheer" className="foot-ati" delay={0.4} />
        <img src="/brand/t1-logo.svg" alt="" width="60" height="24" />
        <p className="site-foot-slogan">Chưa tới ván 5 thì chưa hết.</p>
        <p>Trang do người hâm mộ lập, không liên kết với T1 hay Riot Games. Video phát từ YouTube. Mẫu cờ và phong cảnh: LEARS.</p>
      </footer>

      {customizing && user && <Customizer name={user.name} look={user.look} onSave={handleSave} onClose={() => setCustomizing(false)} />}
      <MusicPlayer admin={admin} />
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
  const [paused] = useState(readFlagsPaused);

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

  useEffect(() => {
    document.documentElement.dataset.motion = paused ? "paused" : "on";
    return () => {
      delete document.documentElement.dataset.motion;
    };
  }, [paused]);

  return (
    <div className={`hero-banner${plain ? " is-plain" : ""}`}>
      <img src="/brand/t1-hero-bg.webp" width="2600" height="745" alt="" />
      <canvas ref={canvas} aria-hidden="true" />
      <ul className="hero-members">
        {MEMBERS.map((member) => (
          <li key={member.name}>{member.name}</li>
        ))}
      </ul>
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
  askToSignIn: () => void;
  onChanged: () => void;
};

function SeatMeter({ room }: { room: RoomListing }) {
  const filled = Math.min(100, (room.viewers / room.capacity) * 100);
  return (
    <div className="seat-meter">
      <div className="seat-meter-bar" aria-hidden="true">
        <span style={{ width: `${filled}%` }} />
      </div>
      <p>
        {room.viewers} / {room.capacity} ghế có người
      </p>
    </div>
  );
}

function ShowCard({ room, user, onEnter, askToSignIn, onChanged }: CardProps) {
  const { videoId } = room.playback;
  const canEnter = room.isOpen || user?.admin === true;

  return (
    <article className="show">
      <div className="show-art">
        <img src={videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "/brand/cup.jpg"} alt="" loading="lazy" />
        <span className="show-room">{room.name}</span>
      </div>
      <div className="show-body">
        <Status room={room} />
        <h3>{room.playback.title ?? "Trận đấu sẽ được công bố sau"}</h3>
        <SeatMeter room={room} />
        {canEnter ? (
          <button className="primary-button" onClick={() => (user ? onEnter(room.id) : askToSignIn())}>
            {user ? (room.isOpen ? "Vào rạp" : "Vào chuẩn bị") : "Đăng nhập để vào"}
          </button>
        ) : (
          <p className="show-wait">Chưa mở cửa</p>
        )}
        {user?.admin && <RoomAccessControls roomId={room.id} access={room} onChanged={onChanged} />}
      </div>
    </article>
  );
}

type EntryProps = { notice: string | null; onSignedIn: (user: User) => void };

function EntryForm({ notice, onSignedIn }: EntryProps) {
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [providers, setProviders] = useState<AuthProviders | null>(null);

  useEffect(() => {
    fetchConfig().then(setConfig, () => { });
    fetchAuthProviders().then(setProviders, () => setProviders({ anonymous: false, google: false }));
  }, []);

  const fail = (failure: Error) => setError(failure.message);

  const handleGoogleSignIn = () => {
    if (providers && !providers.google) {
      setError("Dự án Supabase chưa bật đăng nhập Google. Hãy vào Supabase Dashboard > Authentication > Providers > bật Google.");
      return;
    }
    sessionStorage.setItem("open_customizer", "true");
    signInWithGoogle().catch(fail);
  };

  return (
    <div className="entry">
      {notice && !error && (
        <p className="form-error" role="alert">
          {notice}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="entry-google" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.6rem" }}>
        <button
          type="button"
          className="google-sign-in-btn"
          onClick={handleGoogleSignIn}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          Đăng nhập bằng Gmail (Google)
        </button>
        {config?.devLogin && (
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setError(null);
              signInForDev("Dev Admin").then((devUser) => {
                onSignedIn(devUser);
              }, fail);
            }}
          >
            Vào quyền quản trị DEV (chỉ khi chạy thử trên máy)
          </button>
        )}
      </div>
    </div>
  );
}
