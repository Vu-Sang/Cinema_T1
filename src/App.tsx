import { useCallback, useEffect, useState } from "react";
import { ROOM_IDS, type User } from "../shared/protocol.ts";
import { BannedError, exchangeSession, restoreUser, signOut } from "./api.ts";
import { Home } from "./Home.tsx";
import { Room } from "./Room.tsx";
import { supabase } from "./supabase.ts";

function roomFromHash(): number | null {
  const match = location.hash.match(/^#\/rap\/(\d+)$/);
  const id = match ? Number(match[1]) : null;
  return id !== null && (ROOM_IDS as readonly number[]).includes(id) ? id : null;
}

export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);
  const [roomId, setRoomId] = useState(roomFromHash);

  useEffect(() => {
    // Đọc lỗi từ URL nếu có (ví dụ khi Google OAuth thất bại)
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#\/?/, ""));
    const errorDesc = params.get("error_description") || hashParams.get("error_description");
    if (errorDesc) {
      const cleanDesc = decodeURIComponent(errorDesc).replace(/\+/g, " ");
      if (cleanDesc.includes("Unable to exchange external code")) {
        setNotice("Lỗi kết nối Google: Mã bí mật (Client Secret) trong Supabase chưa đúng hoặc không khớp với Google Cloud.");
      } else {
        setNotice(`Lỗi đăng nhập: ${cleanDesc}`);
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    restoreUser().then(setUser, (failure: Error) => {
      setUser(null);
      if (!errorDesc) setNotice(failure.message);
    });
    const onHashChange = () => setRoomId(roomFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // The site cookie is short-lived, so it is renewed each time Supabase refreshes the token.
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "TOKEN_REFRESHED" || !session) return;
      // Deferred: Supabase holds a lock during this callback, and awaiting inside it can deadlock.
      setTimeout(() => {
        exchangeSession(session.access_token).then(setUser, (failure: Error) => {
          if (!(failure instanceof BannedError)) return;
          setNotice(failure.message);
          setUser(null);
          location.hash = "";
          void supabase?.auth.signOut();
        });
      }, 0);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const leave = useCallback(() => {
    location.hash = "";
  }, []);

  const handleSignedOut = useCallback(() => {
    setUser(null);
    location.hash = "";
  }, []);

  const handleSignOut = useCallback(() => {
    signOut().then(handleSignedOut);
  }, [handleSignedOut]);

  if (user === undefined) return null;
  if (user && roomId !== null) {
    return <Room key={roomId} roomId={roomId} user={user} onUserChange={setUser} onLeave={leave} onSignOut={handleSignOut} onSignedOut={handleSignedOut} />;
  }
  return <Home user={user} notice={notice} onUserChange={setUser} onEnter={(id) => (location.hash = `#/rap/${id}`)} onSignOut={handleSignOut} />;
}
