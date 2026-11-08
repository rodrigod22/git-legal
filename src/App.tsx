import { useEffect } from "react";
import { useStore } from "@/state/store";
import { Topbar } from "@/components/Topbar";
import { Toasts } from "@/components/Toasts";
import { MissionComplete } from "@/components/MissionComplete";
import { Home } from "@/views/Home";
import { DojoMap } from "@/views/DojoMap";
import { MissionView } from "@/views/MissionView";
import { Badges } from "@/views/Badges";
import { Certificate } from "@/views/Certificate";
import { Cheatsheet } from "@/views/Cheatsheet";

export default function App() {
  const view = useStore((s) => s.view);
  const playerName = useStore((s) => s.playerName);
  const go = useStore((s) => s.go);

  // ao recarregar, volta para a trilha (a sessão da missão não é persistida)
  useEffect(() => {
    if (view === "mission") go(playerName ? "map" : "home");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const effective = !playerName && view !== "home" ? "home" : view;

  return (
    <>
      <Topbar />
      <main>
        {effective === "home" && <Home />}
        {effective === "map" && <DojoMap />}
        {effective === "mission" && <MissionView />}
        {effective === "badges" && <Badges />}
        {effective === "certificate" && <Certificate />}
        {effective === "cheatsheet" && <Cheatsheet />}
      </main>
      <Toasts />
      <MissionComplete />
    </>
  );
}
