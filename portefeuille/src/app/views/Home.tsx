import { useCallback, useMemo } from "react";
import { ecartOf } from "../../core/distribute";
import { SEGMENTS, SEGMENT_BY_ID } from "../../core/segments";
import { Icon } from "../icons";
import { useStore } from "../store";
import { fmt, memberVar, pct, plural, useTheme, Who, w } from "../ui";
import { Orbit, type OrbitParticle } from "./Orbit";
import type { Nav } from "../App";

export function Home({ go, openClient }: { go: Nav; openClient: (id: string) => void }) {
  const { state, d, isAdmin, session, duplicates, owner, proposal } = useStore();
  const theme = useTheme();
  const team = state.team;
  const dupCount = isAdmin ? duplicates().length : 0;

  const bodies = useMemo(
    () =>
      d.stats.map((s) => ({
        id: s.id,
        nom: team.find((m) => m.id === s.id)?.nom ?? s.id,
        comptes: s.comptes,
      })),
    [d.stats, team],
  );

  // Particules : les plus gros comptes de chacun (taille ∝ nombre de sites), plus un échantillon du reste.
  const particles = useMemo<OrbitParticle[]>(() => {
    const groups = new Map<string, OrbitParticle[]>();
    d.accounts.forEach((a) => {
      const counts = new Map<string, number>();
      a.clientIds.forEach((id) => {
        const o = owner(id) ?? "";
        counts.set(o, (counts.get(o) ?? 0) + 1);
      });
      counts.forEach((n, o) => {
        const p: OrbitParticle = {
          key: `${a.id}|${counts.size > 1 ? o : ""}`,
          owner: o,
          size: Math.min(10, 1.8 + Math.sqrt(n)),
          label: a.nom,
          sub: `${SEGMENT_BY_ID[a.segment].court} · ${a.ville}`,
        };
        groups.set(o, [...(groups.get(o) ?? []), p]);
      });
    });
    const out: OrbitParticle[] = [];
    groups.forEach((list) => {
      list.sort((x, y) => y.size - x.size);
      const keep = list.slice(0, 60);
      const rest = list.slice(60);
      const step = Math.max(1, Math.floor(rest.length / 70));
      for (let i = 0; i < rest.length && keep.length < 130; i += step) keep.push(rest[i]);
      out.push(...keep);
    });
    return out;
  }, [d.accounts, d, owner]);

  const onMember = useCallback((id: string | null) => (id ? go({ view: "portefeuille", id }) : go({ view: isAdmin ? "repartition" : "recherche" })), [go, isAdmin]);
  const onParticle = useCallback(
    (key: string) => {
      const acct = d.accounts.get(key.split("|")[0]);
      if (acct) openClient(acct.id);
    },
    [d.accounts, openClient],
  );

  const totalAccounts = Math.max(1, d.accounts.size);
  const poolAccounts = d.pool;
  const receivers = team.filter((m) => m.recoit);
  const recvStats = d.stats.filter((s) => receivers.some((r) => r.id === s.id));
  const maxR = Math.max(1, ...recvStats.map((s) => s.comptes));
  const started = recvStats.some((s) => s.comptes > 0);
  const { ecart, ecartComptes } = ecartOf(d.stats, receivers.filter((r) => r.part > 0));
  const preview = isAdmin && d.pool > 0 ? proposal() : null;
  const me = team.find((m) => m.id === session.me);
  const departed = Object.entries(state.settings.libellesCodes).find(([, v]) => /\(parti\)/i.test(v));

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>{isAdmin ? "Portefeuille clients" : `Bonjour ${me?.nom ?? ""}`}</h1>
          <p>
            {fmt(d.accounts.size)} comptes clients · {poolAccounts ? `${fmt(poolAccounts)} encore à répartir` : "tout est réparti"}
          </p>
        </div>
        {isAdmin && d.pool > 0 && (
          <button className="btn primary" onClick={() => go({ view: "repartition" })}>
            <Icon name="shuffle" size={16} /> Répartir les {fmt(poolAccounts)} comptes restants
          </button>
        )}
      </div>

      <Orbit team={team} bodies={bodies} pool={poolAccounts} particles={particles} theme={theme} me={isAdmin ? undefined : session.me} onMember={onMember} onParticle={onParticle} />

      <div className="grid g4" style={{ marginTop: 16 }}>
        {d.stats.map((s) => {
          const m = team.find((t) => t.id === s.id)!;
          return (
            <button key={s.id} className="card stat" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => go({ view: "portefeuille", id: s.id })}>
              <span className="row wrap">
                <Who team={team} id={s.id} />
                {m.responsable && <span className="pill">Responsable</span>}
                {s.id === session.me && !isAdmin && <span className="pill">Toi</span>}
              </span>
              <span className="stat-value">{plural(s.comptes, "compte", "comptes")}</span>
              <span className="stat-sub">{pct(s.comptes / totalAccounts)} des comptes clients</span>
              <div className="meter" style={{ marginTop: 6 }}>
                <span style={{ width: w(s.comptes / totalAccounts), background: memberVar(team, s.id) }} />
              </div>
            </button>
          );
        })}
        <button className="card stat" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => go({ view: isAdmin ? "repartition" : "recherche" })}>
          <span className="row">
            <Who team={team} id={undefined} />
          </span>
          <span className="stat-value">{plural(poolAccounts, "compte", "comptes")}</span>
          <span className="stat-sub">{poolAccounts ? "encore sans propriétaire" : "Tout est réparti"}</span>
          {preview && (
            <span className="stat-sub">
              Proposition prête : écart de {plural(preview.ecartComptes, "compte", "comptes")} entre {receivers.map((r) => r.nom).join(" et ")}
            </span>
          )}
        </button>
      </div>

      <div className="grid g3" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-head">
            <h3 className="grow">Équilibre de l'équipe</h3>
            {started ? (
              <span className={`pill ${ecart < 0.05 ? "ok" : ecart < 0.15 ? "warn" : "bad"}`}>
                <Icon name={ecart < 0.05 ? "check" : "alert"} size={13} /> {ecart < 0.05 ? "Équitable" : ecart < 0.15 ? "À ajuster" : "Déséquilibré"}
              </span>
            ) : (
              <span className="pill">Pas encore réparti</span>
            )}
          </div>
          <p className="dim small" style={{ marginBottom: 12 }}>
            Écart entre {receivers.map((r) => r.nom).join(" et ")} : <b className="num">{plural(ecartComptes, "compte", "comptes")}</b> ({pct(ecart, 1)})
          </p>
          {recvStats.map((s) => (
            <div key={s.id} style={{ marginBottom: 10 }}>
              <div className="row small">
                <span className="grow">{team.find((m) => m.id === s.id)?.nom}</span>
                <span className="num dim">{plural(s.comptes, "compte", "comptes")}</span>
              </div>
              <div className="meter">
                <span style={{ width: `${(s.comptes / maxR) * 100}%`, background: memberVar(team, s.id) }} />
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-head">
            <h3 className="grow">Typologies</h3>
            <button className="btn sm ghost" onClick={() => go({ view: "tableau" })}>
              Détail <Icon name="chevron" size={14} />
            </button>
          </div>
          {SEGMENTS.filter((s) => s.id !== "autre")
            .map((s) => ({ s, n: [...d.accounts.values()].filter((a) => a.segment === s.id).length }))
            .sort((a, b) => b.n - a.n)
            .slice(0, 6)
            .map(({ s, n }) => (
              <div key={s.id} className="row small" style={{ padding: "5px 0" }}>
                <span className="grow dim">{s.label}</span>
                <span className="num">{fmt(n)}</span>
              </div>
            ))}
        </div>

        <div className="card">
          <div className="card-head">
            <h3 className="grow">À faire</h3>
          </div>
          <div className="col">
            {isAdmin && (
              <button className="btn" style={{ justifyContent: "flex-start" }} onClick={() => go({ view: "doublons" })}>
                <Icon name="copy" size={16} /> Vérifier les doublons <span className={`badge${dupCount ? " warn" : ""}`} style={{ marginLeft: "auto" }}>{dupCount}</span>
              </button>
            )}
            {isAdmin && departed && (
              <button className="btn" style={{ justifyContent: "flex-start" }} onClick={() => go({ view: "repartition", tab: "arnaud" })}>
                <Icon name="target" size={16} /> Reprendre des clients de {departed[1].replace(/\s*\(parti\)/i, "")} (code {departed[0]})
              </button>
            )}
            <button className="btn" style={{ justifyContent: "flex-start" }} onClick={() => go({ view: "carte" })}>
              <Icon name="map" size={16} /> Voir la carte
            </button>
            <button className="btn" style={{ justifyContent: "flex-start" }} onClick={() => go({ view: "ajouts" })}>
              <Icon name="inbox" size={16} /> {isAdmin ? "Ajouts des commerciaux" : "Mes ajouts"}
              <span className="badge" style={{ marginLeft: "auto" }}>
                {state.ajouts.filter((a) => a.statut === "en-attente").length}
              </span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
