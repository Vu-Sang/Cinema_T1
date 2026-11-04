import { useCallback, useEffect, useState } from "react";
import { ROOM_IDS, type User } from "../shared/protocol.ts";
import { fetchMe, signOut } from "./api.ts";
import { Home } from "./Home.tsx";
import { Room } from "./Room.tsx";

function roomFromHash(): number | null {
  const match = location.hash.match(/^#\/rap\/(\d+)$/);
  const id = match ? Number(match[1]) : null;
  return id !== null && (ROOM_IDS as readonly number[]).includes(id) ? id : null;
}

export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [roomId, setRoomId] = useState(roomFromHash);

  useEffect(() => {
    fetchMe().then(setUser, () => setUser(null));
    const onHashChange = () => setRoomId(roomFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
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
  return <Home user={user} onUserChange={setUser} onEnter={(id) => (location.hash = `#/rap/${id}`)} onSignOut={handleSignOut} />;
}
