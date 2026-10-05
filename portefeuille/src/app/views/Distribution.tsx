import { useMemo, useState } from "react";
import { groupKey, groupMatches } from "../../core/groups";
import type { Account } from "../../core/types";
import type { Nav } from "../App";
import { AccountTable } from "../AccountTable";
import { Icon } from "../icons";
import { useStore } from "../store";
import { fmt, memberVar, Modal, pct, plural, Seg, Switch, useToast, Who, w } from "../ui";

type Tab = "pool" | "arnaud" | "grands" | "tous" | "manuels";

export function Distribution({ tab: initialTab, openClient }: { tab?: string; go: Nav; openClient: (id: string) => void }) {
  const { state, d, owner, proposal, actions, undo } = useStore();
  const toast = useToast();
  const team = state.team;
  const s = state.settings;
  const [tab, setTab] = useState<Tab>((initialTab as Tab) || "pool");
  const [confirmReset, setConfirmReset] = useState(false);
  const responsable = team.find((m) => m.responsable);
  const receivers = team.filter((m) => m.recoit);
  const departedCode = Object.entries(s.libellesCodes).find(([, v]) => /\(parti\)/i.test(v))?.[0];

  const p = useMemo(() => proposal(), [proposal]);

  // Groupes réservés : mots-clés, comptes qui en portent le nom, exclusions faites à la main.
  const groupes = useMemo(() => [...new Set((s.groupes ?? []).map(groupKey).filter(Boolean))], [s.groupes]);
  const exclus = useMemo(() => new Set(s.groupesExclus ?? []), [s.groupesExclus]);
  // Comptes de chaque groupe, groupe par groupe (un compte peut porter deux noms, ex. une filiale et sa maison mère).
  const members = useMemo(() => new Map(groupes.map((g) => [g, [...groupMatches(d.accounts.values(), d.byId, [g]).keys()]])), [d.accounts, d.byId, groupes]);
  const countOf = (g: string) => (members.get(g) ?? []).filter((id) => !exclus.has(id)).length;
  const [draft, setDraft] = useState("");
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const addGroup = () => {
    const g = groupKey(draft);
    if (!g) return;
    if (!groupes.includes(g)) actions.settings({ groupes: [...groupes, g] });
    setDraft("");
  };
  const removeGroup = (g: string) => actions.settings({ groupes: groupes.filter((x) => x !== g) });
  const toggleExclu = (id: string) =>
    actions.settings({ groupesExclus: exclus.has(id) ? [...exclus].filter((x) => x !== id) : [...exclus, id] });
  const current = d.stats;

  const accounts = useMemo(() => [...d.accounts.values()], [d.accounts]);
  const lists = useMemo(() => {
    const has = (a: Account, f: (id: string) => boolean) => a.clientIds.some(f);
    return {
      pool: accounts.filter((a) => has(a, (id) => !owner(id))),
      arnaud: departedCode ? accounts.filter((a) => a.codes.includes(departedCode)) : [],
      grands: accounts.filter((a) => p.reasons[a.id] === "grand-compte" || p.reasons[a.id] === "groupe"),
      tous: accounts,
      manuels: accounts.filter((a) => has(a, (id) => !!state.pins[id])),
    };
  }, [accounts, owner, p.reasons, state.pins, departedCode]);

  const apply = () => {
    actions.applyProposal();
    toast("Proposition appliquée", { label: "Annuler", run: undo });
  };

  // Comptes qui changeraient de main (au moins une fiche non épinglée).
  const changes = accounts.filter((a) => a.clientIds.some((id) => !state.pins[id] && (p.owners[id] ?? "") !== (state.owners[id] ?? ""))).length;
  const totalComptes = Math.max(1, d.accounts.size);

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>Répartition</h1>
          <p>
            Vous gardez vos clients ({responsable?.codes.join(", ")}), vos groupes réservés et les plus gros comptes ; le reste est partagé équitablement entre{" "}
            {receivers.map((r) => r.nom).join(" et ")}, en nombre de comptes.
          </p>
        </div>
      </div>

      <div className="grid g3">
        <div className="card span2">
          <div className="card-head">
            <div className="grow">
              <h3>Proposition automatique</h3>
              <p>Réglez, observez le résultat, puis appliquez. Vos choix manuels (épinglés) ne sont jamais modifiés.</p>
            </div>
            <span className={`pill ${p.ecart < 0.05 ? "ok" : p.ecart < 0.15 ? "warn" : "bad"}`}>
              Écart {receivers.map((r) => r.nom).join("/")} : {plural(p.ecartComptes, "compte", "comptes")}
            </span>
          </div>
          <div className="table-wrap" style={{ maxHeight: "none" }}>
            <table className="table">
              <thead>
                <tr>
                  <th />
                  <th className="r">Comptes</th>
                  <th className="r">Part</th>
                  <th className="r hide-mobile">Variation</th>
                </tr>
              </thead>
              <tbody>
                {p.stats.map((ps) => {
                  const cs = current.find((x) => x.id === ps.id)!;
                  const delta = ps.comptes - cs.comptes;
                  return (
                    <tr key={ps.id}>
                      <td>
                        <Who team={team} id={ps.id} />
                      </td>
                      <td className="r num">
                        <b>{fmt(ps.comptes)}</b>
                      </td>
                      <td className="r num">{pct(ps.comptes / totalComptes)}</td>
                      <td className="r num hide-mobile" style={{ color: delta ? "var(--text-2)" : "var(--muted)" }}>
                        {delta > 0 ? "+" : ""}
                        {fmt(delta)} comptes
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ margin: "14px 0 6px" }}>
            <div className="meter" style={{ height: 12 }}>
              {p.stats.map((ps) => (
                <span key={ps.id} style={{ width: w(ps.comptes / totalComptes), background: memberVar(team, ps.id) }} />
              ))}
            </div>
            <div className="legend" style={{ marginTop: 8 }}>
              {p.stats.map((ps) => (
                <span key={ps.id}>
                  <i style={{ background: memberVar(team, ps.id) }} />
                  {team.find((m) => m.id === ps.id)?.nom} {pct(ps.comptes / totalComptes)} des comptes
                </span>
              ))}
            </div>
          </div>
          <div className="row wrap" style={{ marginTop: 14 }}>
            <button className="btn primary" disabled={!changes} onClick={apply}>
              <Icon name="sparkle" size={16} /> Appliquer la proposition {changes ? `(${plural(changes, "compte", "comptes")})` : ""}
            </button>
            <span className="spacer" />
            <button className="btn ghost danger" onClick={() => setConfirmReset(true)}>
              Tout remettre à zéro
            </button>
          </div>
          <ol className="small dim" style={{ margin: "18px 0 0", paddingLeft: 18, display: "grid", gap: 6 }}>
            <li>
              <b>{responsable?.nom}</b> garde tous ses clients (code {responsable?.codes.join(", ")}) et vos choix manuels sont respectés.
            </li>
            {s.rattacherComptes && <li>Un compte n'est jamais coupé : il reste entier chez celui qui en tient déjà une partie.</li>}
            {groupes.length > 0 && (
              <li>
                Tous les comptes des groupes {groupes.join(", ")} reviennent à {responsable?.nom}.
              </li>
            )}
            {s.grandsComptes > 0 && (
              <li>
                Les {s.grandsComptes} plus gros comptes encore libres reviennent aussi à {responsable?.nom}.
              </li>
            )}
            <li>
              Le reste est partagé entre {receivers.map((r) => r.nom).join(" et ")}{" "}
              {s.mode === "type"
                ? "en nombre de comptes : autant de comptes de chaque typologie pour chacun, les gros comptes alternés, en privilégiant les villes où chacun est déjà présent."
                : "en secteurs géographiques d'un seul tenant, avec autant de comptes chacun."}
            </li>
          </ol>
        </div>

        <div className="card col" style={{ gap: 16 }}>
          <h3>Règles</h3>
          <div className="field">
            <span>Méthode de partage</span>
            <Seg
              value={s.mode}
              onChange={(mode) => actions.settings({ mode })}
              options={[
                ["type", "Par typologie"],
                ["territoire", "Par secteur"],
              ]}
            />
            <span className="small muted">
              {s.mode === "type"
                ? "Chacun reçoit le même nombre de comptes dans chaque typologie (industrie, tertiaire, boulangeries…)."
                : "Chacun reçoit un secteur géographique d'un seul tenant autour de Lyon, avec autant de comptes : moins de route."}
            </span>
          </div>
          <div className="field">
            <span>Groupes réservés à {responsable?.nom}</span>
            <div className="row wrap" style={{ gap: 6 }}>
              {groupes.map((g) => (
                <span key={g} className="chip" aria-pressed="true" style={{ cursor: "default" }}>
                  <button className="linklike" onClick={() => setOpenGroup(g)} title="Voir les comptes de ce groupe">
                    {g} <span className="num muted">{fmt(countOf(g))}</span>
                  </button>
                  <button className="linklike" aria-label={`Retirer le groupe ${g}`} onClick={() => removeGroup(g)}>
                    <Icon name="x" size={12} />
                  </button>
                </span>
              ))}
            </div>
            <form
              className="row"
              style={{ gap: 6 }}
              onSubmit={(e) => {
                e.preventDefault();
                addGroup();
              }}
            >
              <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ex. le nom d'un grand groupe" aria-label="Nouveau groupe" />
              <button className="btn sm" type="submit" disabled={!groupKey(draft)}>
                Ajouter
              </button>
            </form>
            <span className="small muted">Tous les comptes dont le nom (ou celui du payeur) contient ce mot lui reviennent. Cliquez sur un groupe pour en exclure un compte.</span>
          </div>
          <label className="field">
            <span>
              Plus gros comptes du pool réservés à {responsable?.nom} : <b>{s.grandsComptes}</b>
            </span>
            <input type="range" min={0} max={40} value={s.grandsComptes} onChange={(e) => actions.settings({ grandsComptes: +e.target.value })} />
          </label>
          <Switch checked={s.rattacherComptes} onChange={(v) => actions.settings({ rattacherComptes: v })} label="Un compte n'est jamais coupé : il reste entier chez celui qui le tient déjà" />
          {s.mode === "type" && <Switch checked={s.proximite} onChange={(v) => actions.settings({ proximite: v })} label="Privilégier la proximité (même ville)" />}
          {receivers.map((m) => (
            <label className="field" key={m.id}>
              <span>
                Part du pool pour {m.nom} : <b>{pct(m.part / receivers.reduce((x, y) => x + y.part, 0))}</b>
              </span>
              <input type="range" min={0.25} max={3} step={0.25} value={m.part} onChange={(e) => actions.memberUpdate(m.id, { part: +e.target.value })} />
            </label>
          ))}
        </div>
      </div>

      <div className="row wrap" style={{ margin: "26px 0 12px" }}>
        <Seg<Tab>
          value={tab}
          onChange={setTab}
          options={[
            ["pool", `À répartir (${fmt(lists.pool.length)})`],
            ...(departedCode ? [["arnaud", `${s.libellesCodes[departedCode].replace(/\s*\(parti\)/i, "")} · code ${departedCode} (${fmt(lists.arnaud.length)})`] as [Tab, string]] : []),
            ["grands", `Groupes & grands comptes (${fmt(lists.grands.length)})`],
            ["manuels", `Choix manuels (${fmt(lists.manuels.length)})`],
            ["tous", "Tous"],
          ]}
        />
      </div>
      {tab === "arnaud" && (
        <div className="banner" style={{ marginBottom: 12 }}>
          <Icon name="info" />
          <span className="small">
            Les comptes portant le code {departedCode} ({departedCode && s.libellesCodes[departedCode]}). Vous en gérez encore ? Cliquez sur votre initiale pour les reprendre : le choix est épinglé et la proposition
            automatique n'y touchera plus.
          </span>
        </div>
      )}
      {tab === "grands" && (
        <div className="banner" style={{ marginBottom: 12 }}>
          <Icon name="star" />
          <span className="small">
            Les comptes des groupes réservés et les {s.grandsComptes} plus gros comptes encore libres : ils vous reviennent dans la proposition. Réglez-les dans les règles ci-dessus.
          </span>
        </div>
      )}
      <AccountTable
        key={tab}
        accounts={lists[tab]}
        openClient={openClient}
        proposed={tab === "pool" || tab === "grands" ? p.owners : undefined}
        reasons={p.reasons}
        emptyText={tab === "pool" ? "Tout le portefeuille est réparti." : "Aucun compte"}
      />

      {openGroup && (
        <Modal
          title={`Groupe ${openGroup}`}
          onClose={() => setOpenGroup(null)}
          foot={
            <button className="btn primary" onClick={() => setOpenGroup(null)}>
              Fermer
            </button>
          }
        >
          <p className="dim small" style={{ marginBottom: 10 }}>
            Comptes dont le nom, ou celui du payeur, contient « {openGroup} ». Décochez ceux qui ne font pas partie du groupe : ils seront répartis normalement.
          </p>
          <div className="col" style={{ gap: 2 }}>
            {(members.get(openGroup) ?? [])
              .map((id) => d.accounts.get(id)!)
              .sort((x, y) => x.nom.localeCompare(y.nom))
              .map((a) => (
                <div key={a.id} className="row" style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <b className="ellipsis" style={{ display: "block" }}>
                      {a.nom || "Client confidentiel"}
                    </b>
                    <span className="small muted">
                      {a.cp} {a.ville}
                    </span>
                  </span>
                  <Switch checked={!exclus.has(a.id)} onChange={() => toggleExclu(a.id)} label="Dans le groupe" />
                </div>
              ))}
          </div>
        </Modal>
      )}

      {confirmReset && (
        <Modal
          title="Tout remettre à zéro ?"
          onClose={() => setConfirmReset(false)}
          foot={
            <>
              <button className="btn ghost" onClick={() => setConfirmReset(false)}>
                Annuler
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  actions.resetDistribution();
                  setConfirmReset(false);
                  toast("Répartition remise à zéro", { label: "Annuler", run: undo });
                }}
              >
                Remettre à zéro
              </button>
            </>
          }
        >
          <p className="dim">
            Seuls les clients de vos codes ERP ({responsable?.codes.join(", ")}) restent attribués. Tous les choix manuels sont effacés. Vous pourrez annuler juste après.
          </p>
        </Modal>
      )}
    </>
  );
}
