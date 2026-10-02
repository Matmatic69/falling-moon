import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { Unlock, Welcome, type Opened } from "./app/Gate";
import { StoreProvider } from "./app/store";
import { ToastProvider, useToast } from "./app/ui";
import { readEmbedded } from "./lib/file";
import { lsGet } from "./lib/idb";
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

function Root() {
  const [opened, setOpened] = useState<Opened | null>(null);
  const meta = readEmbedded();
  if (!opened) return meta ? <Unlock meta={meta} onReady={setOpened} /> : <Welcome onReady={setOpened} />;
  return (
    <StoreProvider initial={opened.state} session={opened.session}>
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
