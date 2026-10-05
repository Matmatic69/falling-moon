import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { Unlock, Welcome, type Opened } from "./app/Gate";
import { StoreProvider } from "./app/store";
import { ToastProvider, useToast } from "./app/ui";
import { readEmbedded, type FileMeta } from "./lib/file";
import { lsGet } from "./lib/idb";
import type { Session } from "./app/store";
import { useEffect } from "react";

const stored = lsGet("pf-theme");
document.documentElement.dataset.theme = stored ?? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");

function Notice({ text }: { text?: string }) {
  const toast = useToast();
  useEffect(() => {
    if (text) toast(text);
  }, [text, toast]);
  return null;
}

/** Fichier partagé : ouverture directe en consultation, au nom choisi par la personne dans ce navigateur. */
function teamOpened(meta: FileMeta): Opened {
  const { state, k } = meta.team!;
  const saved = lsGet("pf-moi");
  const me = state.team.some((m) => m.id === saved) ? saved! : (state.team.find((m) => !m.responsable) ?? state.team[0]).id;
  const session: Session = { role: "commercial", me, key: null, equipe: true, teamKey: k, detail: "nom" };
  return { state, session };
}

function Root() {
  const meta = readEmbedded();
  const [opened, setOpened] = useState<Opened | null>(() => (meta?.team ? teamOpened(meta) : null));
  const [unlocking, setUnlocking] = useState(false);
  useEffect(() => {
    const h = () => setUnlocking(true);
    window.addEventListener("pf-admin", h);
    return () => window.removeEventListener("pf-admin", h);
  }, []);
  if (unlocking && meta)
    return (
      <Unlock
        meta={meta}
        onReady={(o) => {
          setUnlocking(false);
          setOpened(o);
        }}
        onCancel={() => setUnlocking(false)}
      />
    );
  if (!opened) return meta ? <Unlock meta={meta} onReady={setOpened} /> : <Welcome onReady={setOpened} />;
  return (
    <StoreProvider key={opened.session.role + opened.session.me} initial={opened.state} session={opened.session}>
      <Notice text={opened.notice} />
      <App />
    </StoreProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <Root />
    </ToastProvider>
  </StrictMode>,
);
