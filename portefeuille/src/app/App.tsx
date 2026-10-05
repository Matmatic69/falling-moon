import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "./icons";
import { useStore } from "./store";
import { memberVar, useToast } from "./ui";
import { Home } from "./views/Home";
import { Dashboard } from "./views/Dashboard";
import { MapView } from "./views/MapView";
import { Portfolio } from "./views/Portfolio";
import { Distribution } from "./views/Distribution";
import { Duplicates } from "./views/Duplicates";
import { SettingsView } from "./views/Settings";
import { Ajouts } from "./views/Ajouts";
import { SearchView } from "./views/SearchView";
import { SearchPalette } from "./SearchPalette";
import { ClientDrawer } from "./ClientDrawer";
import { AddClient } from "./AddClient";
import { saveSnapshot } from "./files";
import { lsSet } from "../lib/idb";

export type Route =
  | { view: "accueil" }
  | { view: "tableau" }
  | { view: "carte"; owner?: string }
  | { view: "portefeuille"; id: string }
  | { view: "recherche"; q?: string }
  | { view: "repartition"; tab?: string }
  | { view: "doublons" }
  | { view: "ajouts" }
  | { view: "reglages" };

export type Nav = (r: Route) => void;

function parseHash(): Route {
  const [view, arg] = decodeURIComponent(location.hash.replace(/^#\/?/, "")).split("/");
  switch (view) {
    case "tableau":
    case "doublons":
    case "ajouts":
    case "reglages":
      return { view };
    case "carte":
      return { view, owner: arg || undefined };
    case "portefeuille":
      return arg ? { view, id: arg } : { view: "accueil" };
    case "recherche":
      return { view, q: arg };
    case "repartition":
      return { view, tab: arg };
    default:
      return { view: "accueil" };
  }
}

function toHash(r: Route): string {
  const arg = "id" in r ? r.id : "tab" in r ? r.tab : "owner" in r ? r.owner : "q" in r ? r.q : undefined;
  return `#/${r.view}${arg ? "/" + encodeURIComponent(arg) : ""}`;
}

export function App() {
  const store = useStore();
  const { state, isAdmin, session, d, dirty, savedLocally, duplicates, undo, canUndo } = store;
  const toast = useToast();
  const [route, setRoute] = useState<Route>(parseHash);
  const [palette, setPalette] = useState(false);
  const [client, setClient] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [theme, setTheme] = useState(document.documentElement.dataset.theme ?? "dark");

  useEffect(() => {
    const h = () => setRoute(parseHash());
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);

  const go = useCallback<Nav>((r) => {
    const h = toHash(r);
    if (location.hash !== h) location.hash = h;
    else setRoute(r);
    window.scrollTo({ top: 0 });
  }, []);

  // Un commercial ne voit pas les écrans de gestion.
  useEffect(() => {
    if (!isAdmin && ["repartition", "doublons", "reglages"].includes(route.view)) go({ view: "accueil" });
  }, [isAdmin, route.view, go]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        if (isAdmin && canUndo) {
          e.preventDefault();
          undo();
          toast("Action annulée");
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveSnapshot(store).then((ok) => ok && toast("Fichier sauvegardé"));
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isAdmin, canUndo, undo, toast, store]);

  // Prévenir avant de fermer si des changements ne sont que dans ce navigateur.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty && !savedLocally) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty, savedLocally]);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    lsSet("pf-theme", next);
    setTheme(next);
  };

  const dupCount = useMemo(() => (isAdmin ? duplicates().length : 0), [isAdmin, duplicates]);
  const pending = state.ajouts.filter((a) => a.statut === "en-attente").length;
  const me = state.team.find((m) => m.id === session.me);

  const nav: { r: Route; label: string; icon: IconName; badge?: number; admin?: boolean }[] = [
    { r: { view: "accueil" }, label: "Accueil", icon: "home" },
    { r: { view: "tableau" }, label: "Tableau de bord", icon: "chart" },
    { r: { view: "carte" }, label: "Carte", icon: "map" },
    { r: { view: "recherche" }, label: "Recherche avancée", icon: "search" },
    { r: { view: "repartition" }, label: "Répartition", icon: "shuffle", admin: true, badge: d.pool || undefined },
    { r: { view: "doublons" }, label: "Doublons", icon: "copy", admin: true, badge: dupCount || undefined },
    { r: { view: "ajouts" }, label: isAdmin ? "Ajouts reçus" : "Mes ajouts", icon: "inbox", badge: pending || undefined },
    { r: { view: "reglages" }, label: "Réglages & fichiers", icon: "settings", admin: true },
  ];
  const visibleNav = nav.filter((n) => isAdmin || !n.admin);
  const isActive = (r: Route) => r.view === route.view && (r.view !== "portefeuille" || ("id" in route && "id" in r && route.id === r.id));

  const view = (() => {
    switch (route.view) {
      case "tableau":
        return <Dashboard go={go} />;
      case "carte":
        return <MapView initialOwner={route.owner} openClient={setClient} />;
      case "portefeuille":
        return <Portfolio id={route.id} go={go} openClient={setClient} />;
      case "recherche":
        return <SearchView initial={route.q} openClient={setClient} />;
      case "repartition":
        return <Distribution tab={route.tab} go={go} openClient={setClient} />;
      case "doublons":
        return <Duplicates openClient={setClient} />;
      case "ajouts":
        return <Ajouts openClient={setClient} />;
      case "reglages":
        return <SettingsView />;
      default:
        return <Home go={go} openClient={setClient} />;
    }
  })();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <i />
            <i />
            <i />
          </div>
          <div>
            <b>Portefeuille</b>
            <span>{isAdmin ? "Espace responsable" : `Fichier de ${me?.nom ?? ""}`}</span>
          </div>
        </div>
        {visibleNav.slice(0, 4).map((n) => (
          <button key={n.label} className="nav-item" aria-current={isActive(n.r) ? "page" : undefined} onClick={() => go(n.r)}>
            <Icon name={n.icon} size={17} /> {n.label}
            {n.badge ? <span className="badge">{n.badge}</span> : null}
          </button>
        ))}
        <div className="nav-sep">Portefeuilles</div>
        {state.team.map((m) => (
          <button key={m.id} className="nav-item" aria-current={isActive({ view: "portefeuille", id: m.id }) ? "page" : undefined} onClick={() => go({ view: "portefeuille", id: m.id })}>
            <span className="nav-dot" style={{ background: memberVar(state.team, m.id) }} />
            {m.nom}
            {m.id === session.me && !isAdmin ? <span className="badge">Toi</span> : <span className="badge" title="Comptes">{d.stats.find((s) => s.id === m.id)?.comptes ?? 0}</span>}
          </button>
        ))}
        <div className="nav-sep">{isAdmin ? "Gestion" : "Mes actions"}</div>
        {visibleNav.slice(4).map((n) => (
          <button key={n.label} className="nav-item" aria-current={isActive(n.r) ? "page" : undefined} onClick={() => go(n.r)}>
            <Icon name={n.icon} size={17} /> {n.label}
            {n.badge ? <span className={`badge${n.r.view === "doublons" ? " warn" : ""}`}>{n.badge}</span> : null}
          </button>
        ))}
        <div className="sidebar-foot">
          <button className="btn" onClick={() => void saveSnapshot(store).then((ok) => ok && toast("Fichier sauvegardé — gardez-le à l'abri"))}>
            <Icon name="download" size={16} /> {isAdmin ? "Sauvegarder le fichier" : "Garder une copie"}
            {dirty && isAdmin && <span className="badge warn">•</span>}
          </button>
          <div className="row">
            <button className="btn ghost sm grow" onClick={toggleTheme} aria-label="Changer de thème">
              <Icon name={theme === "light" ? "moon" : "sun"} size={15} /> {theme === "light" ? "Sombre" : "Clair"}
            </button>
            <button className="btn ghost sm grow" onClick={() => location.reload()} title="Verrouiller (le mot de passe sera redemandé)">
              <Icon name="lock" size={15} /> Verrouiller
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="searchbox" onClick={() => setPalette(true)}>
            <Icon name="search" size={16} />
            <span className="ellipsis">À qui appartient ce client ? Nom, ville, n° client, téléphone…</span>
            <span className="kbd hide-mobile">Ctrl K</span>
          </button>
          <div className="row" style={{ marginLeft: "auto", gap: 10 }}>
          {isAdmin && canUndo && (
            <button className="btn ghost icon hide-mobile" title="Annuler (Ctrl Z)" onClick={() => (undo(), toast("Action annulée"))}>
              <Icon name="undo" size={17} />
            </button>
          )}
          <span className="pill hide-mobile" title="Copie de travail chiffrée dans ce navigateur">
            <Icon name={savedLocally === false ? "alert" : "lock"} size={12} />
            {savedLocally === false ? "Non mémorisé ici : sauvegardez le fichier" : dirty ? "Enregistré dans ce navigateur" : "Chiffré"}
          </span>
          <button className="btn primary" onClick={() => setAdding("")}>
            <Icon name="plus" size={16} /> <span className="hide-mobile">Ajouter un client</span>
          </button>
          </div>
        </header>
        <main className="content" key={toHash(route)}>
          {view}
        </main>
      </div>

      <nav className="mobile-nav">
        {(
          [
            [{ view: "accueil" }, "Accueil", "home"],
            [{ view: "carte" }, "Carte", "map"],
            [{ view: "recherche" }, "Recherche", "search"],
            [{ view: "portefeuille", id: session.me }, isAdmin ? "Mes clients" : "Mes clients", "users"],
            isAdmin ? [{ view: "repartition" }, "Répartir", "shuffle"] : [{ view: "ajouts" }, "Ajouts", "inbox"],
          ] as [Route, string, IconName][]
        ).map(([r, label, icon]) => (
          <button key={label} aria-current={isActive(r) ? "page" : undefined} onClick={() => go(r)}>
            <Icon name={icon} size={20} />
            {label}
          </button>
        ))}
      </nav>

      {palette && (
        <SearchPalette
          onClose={() => setPalette(false)}
          openClient={(id) => {
            setPalette(false);
            setClient(id);
          }}
          onAdvanced={(q) => {
            setPalette(false);
            go({ view: "recherche", q });
          }}
          onAdd={(q) => {
            setPalette(false);
            setAdding(q);
          }}
        />
      )}
      {client && <ClientDrawer id={client} onClose={() => setClient(null)} openClient={setClient} go={go} />}
      {adding !== null && <AddClient initialName={adding} onClose={() => setAdding(null)} openClient={setClient} />}
    </div>
  );
}
