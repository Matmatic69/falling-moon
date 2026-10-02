import { useEffect, useMemo, useRef, useState } from "react";
import { search } from "../core/search";
import { SEGMENT_BY_ID } from "../core/segments";
import { Icon } from "./icons";
import { useStore } from "./store";
import { useEscape, Who } from "./ui";

export function SearchPalette({
  onClose,
  openClient,
  onAdvanced,
  onAdd,
}: {
  onClose: () => void;
  openClient: (id: string) => void;
  onAdvanced: (q: string) => void;
  onAdd: (q: string) => void;
}) {
  const { d, state, owner } = useStore();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEscape(onClose);
  useEffect(() => input.current?.focus(), []);

  const hits = useMemo(() => search(d.index, q, 12), [d.index, q]);
  useEffect(() => setSel(0), [q]);
  const top = hits[0];
  const clear = top && (hits.length === 1 || top.score >= 300 || top.score > (hits[1]?.score ?? 0) + 150);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(hits.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter" && hits[sel]) openClient(hits[sel].c.id);
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal palette" role="dialog" aria-modal="true" aria-label="Recherche">
        <input
          ref={input}
          className="palette-input"
          placeholder="À qui appartient… (nom, ville, n° client, téléphone, SIREN)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          aria-label="Rechercher un client"
        />
        {clear && top && (
          <div style={{ padding: "12px 12px 0" }}>
            <div className="answer">
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="small muted">« {top.c.nom} » appartient à</span>
                <div style={{ marginTop: 6 }}>
                  <Who team={state.team} id={owner(top.c.id)} big />
                </div>
              </span>
              <button className="btn sm" onClick={() => openClient(top.c.id)}>
                Ouvrir la fiche
              </button>
            </div>
          </div>
        )}
        <div className="palette-list" role="listbox">
          {q && hits.length === 0 && (
            <div className="empty">
              <span>Aucun client ne correspond à « {q} ».</span>
              <button className="btn" onClick={() => onAdd(q)}>
                <Icon name="plus" size={16} /> Ajouter « {q} »
              </button>
            </div>
          )}
          {!q && <div className="empty small">Tapez un nom, une ville, un numéro client ou un téléphone.</div>}
          {hits.map((h, i) => (
            <button key={h.c.id} className="palette-item" role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => openClient(h.c.id)}>
              <span className="grow" style={{ minWidth: 0 }}>
                <div className="ellipsis">
                  <b>{h.c.nom}</b>
                </div>
                <div className="small muted ellipsis">
                  {h.c.cp} {h.c.ville} · {SEGMENT_BY_ID[h.c.segment].court} · n° {h.c.numero}
                </div>
              </span>
              <Who team={state.team} id={owner(h.c.id)} />
            </button>
          ))}
        </div>
        <div className="row" style={{ padding: "10px 14px", borderTop: "1px solid var(--line)" }}>
          <span className="small muted grow">↑↓ pour choisir · Entrée pour ouvrir · Échap pour fermer</span>
          <button className="btn sm ghost" onClick={() => onAdvanced(q)}>
            Recherche avancée <Icon name="chevron" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
