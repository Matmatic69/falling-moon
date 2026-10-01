import { useEffect, useRef, useState } from "react";
import type { Member } from "../../core/types";
import { colorOf, fmt, Tooltip, type Theme } from "../ui";

export interface OrbitBody {
  id: string;
  nom: string;
  clients: number;
  sites: number;
  comptes: number;
  contrats: number;
  score: number;
}

export interface OrbitParticle {
  key: string;
  owner: string;
  size: number;
  label: string;
  sub: string;
}

interface P {
  key: string;
  owner: string;
  size: number;
  label: string;
  sub: string;
  // orbite
  r: number;
  a: number;
  w: number;
  tilt: number;
  // centre courant (animé quand le propriétaire change)
  cx: number;
  cy: number;
  fx: number;
  fy: number;
  t: number;
  alpha: number;
  target: number;
  // dernière position dessinée (pour le survol)
  x: number;
  y: number;
}

const POOL = "__pool__";

function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function rand(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function Orbit({
  team,
  bodies,
  pool,
  particles,
  theme,
  me,
  onMember,
  onParticle,
}: {
  team: Member[];
  bodies: OrbitBody[];
  pool: number;
  particles: OrbitParticle[];
  theme: Theme;
  me?: string;
  onMember: (id: string | null) => void;
  onParticle: (key: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ bodies, pool, particles, theme, team, me });
  live.current = { bodies, pool, particles, theme, team, me };
  const parts = useRef(new Map<string, P>());
  const hover = useRef<{ kind: "body" | "p"; id: string } | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; title: string; sub: string } | null>(null);
  const layout = useRef(new Map<string, { x: number; y: number; R: number }>());

  // Synchronise les particules avec les données (sans réinitialiser celles qui existent : elles migrent).
  useEffect(() => {
    const map = parts.current;
    const seen = new Set<string>();
    for (const sp of particles) {
      seen.add(sp.key);
      const owner = sp.owner || POOL;
      const cur = map.get(sp.key);
      if (cur) {
        if (cur.owner !== owner) {
          cur.fx = cur.cx;
          cur.fy = cur.cy;
          cur.t = 0;
          cur.owner = owner;
        }
        cur.size = sp.size;
        cur.label = sp.label;
        cur.sub = sp.sub;
        cur.target = 1;
      } else {
        const rnd = rand(sp.key);
        map.set(sp.key, {
          key: sp.key,
          owner,
          size: sp.size,
          label: sp.label,
          sub: sp.sub,
          r: rnd(),
          a: rnd() * Math.PI * 2,
          w: 0.6 + rnd() * 0.7,
          tilt: (rnd() - 0.5) * 0.5,
          cx: NaN,
          cy: NaN,
          fx: NaN,
          fy: NaN,
          t: 1,
          alpha: 0,
          target: 1,
          x: 0,
          y: 0,
        });
      }
    }
    map.forEach((p) => {
      if (!seen.has(p.key)) p.target = 0;
    });
  }, [particles]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let visible = true;
    let W = 0;
    let H = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stars = Array.from({ length: 90 }, (_, i) => {
      const r = rand("s" + i);
      return { x: r(), y: r(), s: r() * 1.2 + 0.2, tw: r() * Math.PI * 2 };
    });

    const resize = () => {
      W = wrap.clientWidth;
      H = W < 640 ? Math.round(W * 1.15) : Math.max(480, Math.min(600, W * 0.5));
      wrap.style.height = H + "px";
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(wrap);

    const place = () => {
      const { bodies: bs, pool: poolN, team: tm } = live.current;
      const narrow = W < 640;
      const maxScore = Math.max(1, ...bs.map((b) => b.score));
      const base = Math.min(W, H) * (narrow ? 0.14 : 0.135);
      const resp = tm.find((m) => m.responsable)?.id;
      const others = bs.filter((b) => b.id !== resp);
      const slots: [number, number][] = narrow
        ? [
            [0.5, 0.24],
            [0.27, 0.6],
            [0.73, 0.6],
            [0.5, 0.6],
          ]
        : [
            [0.5, 0.4],
            [0.2, 0.52],
            [0.8, 0.52],
            [0.5, 0.75],
          ];
      const order = resp ? [bs.find((b) => b.id === resp)!, ...others] : bs;
      layout.current.clear();
      order.forEach((b, i) => {
        if (!b) return;
        const [sx, sy] = slots[Math.min(i, slots.length - 1)];
        const R = base * (0.62 + 0.38 * Math.sqrt(b.score / maxScore));
        layout.current.set(b.id, { x: sx * W, y: sy * H, R });
      });
      if (poolN > 0) {
        const total = bs.reduce((s, b) => s + b.clients, 0) + poolN;
        const R = base * (0.32 + 0.4 * Math.sqrt(poolN / Math.max(1, total)));
        layout.current.set(POOL, { x: W * 0.5, y: H * (narrow ? 0.85 : 0.84), R });
      }
    };

    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) {
        last = now;
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000) * (reduce ? 0.12 : 1);
      last = now;
      place();
      const { theme: th, team: tm, bodies: bs, me: meId } = live.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // ciel étoilé discret
      for (const s of stars) {
        const tw = 0.35 + 0.35 * Math.sin(s.tw + now / 1400);
        ctx.fillStyle = hexA(th.light ? "#000000" : "#ffffff", (th.light ? 0.08 : 0.22) * tw);
        ctx.fillRect(s.x * W, s.y * H, s.s, s.s);
      }

      const colorFor = (owner: string) => (owner === POOL ? th.pool : colorOf(th, tm, owner));

      // anneaux d'orbite
      layout.current.forEach((L, id) => {
        ctx.save();
        ctx.translate(L.x, L.y);
        ctx.strokeStyle = hexA(colorFor(id).startsWith("#") ? colorFor(id) : "#888888", 0.12);
        ctx.lineWidth = 1;
        for (const k of [1.6, 2.5]) {
          ctx.beginPath();
          ctx.ellipse(0, 0, L.R * k, L.R * k * 0.5, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      });

      // particules : mise à jour
      const list: P[] = [];
      parts.current.forEach((p) => {
        p.alpha += (p.target - p.alpha) * Math.min(1, dt * 3);
        if (p.target === 0 && p.alpha < 0.02) {
          parts.current.delete(p.key);
          return;
        }
        const host = layout.current.get(p.owner) ?? layout.current.get(POOL) ?? { x: W / 2, y: H / 2, R: 30 };
        if (Number.isNaN(p.cx)) {
          p.cx = host.x;
          p.cy = host.y;
          p.fx = host.x;
          p.fy = host.y;
        }
        if (p.t < 1) {
          p.t = Math.min(1, p.t + dt / 1.4);
          const e = p.t < 0.5 ? 4 * p.t ** 3 : 1 - (-2 * p.t + 2) ** 3 / 2;
          p.cx = p.fx + (host.x - p.fx) * e;
          p.cy = p.fy + (host.y - p.fy) * e - Math.sin(Math.PI * e) * 60;
        } else {
          p.cx = host.x;
          p.cy = host.y;
        }
        const orbitR = host.R * (W < 640 ? 1.2 + p.r * 0.9 : 1.3 + p.r * 1.45);
        p.a += (dt * p.w * 0.55 * 60) / Math.max(40, orbitR);
        const ex = Math.cos(p.a) * orbitR;
        const ey = Math.sin(p.a) * orbitR * 0.5;
        p.x = p.cx + ex * Math.cos(p.tilt) - ey * Math.sin(p.tilt);
        p.y = p.cy + ex * Math.sin(p.tilt) + ey * Math.cos(p.tilt);
        list.push(p);
      });

      const drawP = (p: P, front: boolean) => {
        const depth = Math.sin(p.a);
        if (front !== depth >= 0) return;
        const hov = hover.current?.kind === "p" && hover.current.id === p.key;
        const r = p.size * (front ? 1 : 0.8) * (hov ? 1.6 : 1);
        const col = colorFor(p.owner);
        ctx.globalAlpha = p.alpha * (front ? 0.95 : 0.35);
        if (front) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 1.5, 0, Math.PI * 2);
          ctx.fillStyle = th.surface;
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.globalAlpha = 1;
      };

      list.forEach((p) => drawP(p, false));

      // bulles
      layout.current.forEach((L, id) => {
        const isPool = id === POOL;
        const b = bs.find((x) => x.id === id);
        const col = colorFor(id);
        const hov = hover.current?.kind === "body" && hover.current.id === id;
        const pulse = 1 + (reduce ? 0 : Math.sin(now / 900 + L.x) * 0.012);
        const R = L.R * pulse * (hov ? 1.05 : 1);
        ctx.save();
        ctx.shadowColor = hexA(col, th.light ? 0.35 : 0.55);
        ctx.shadowBlur = hov ? 50 : 32;
        const g = ctx.createRadialGradient(L.x - R * 0.35, L.y - R * 0.4, R * 0.1, L.x, L.y, R);
        g.addColorStop(0, hexA(col, 1));
        g.addColorStop(1, hexA(col, isPool ? 0.55 : 0.78));
        ctx.beginPath();
        ctx.arc(L.x, L.y, R, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.restore();
        // reflet
        const hl = ctx.createRadialGradient(L.x - R * 0.4, L.y - R * 0.5, 0, L.x - R * 0.4, L.y - R * 0.5, R * 0.9);
        hl.addColorStop(0, "rgba(255,255,255,0.32)");
        hl.addColorStop(1, "rgba(255,255,255,0)");
        ctx.beginPath();
        ctx.arc(L.x, L.y, R, 0, Math.PI * 2);
        ctx.fillStyle = hl;
        ctx.fill();
        if (meId && id === meId) {
          ctx.strokeStyle = hexA("#ffffff", 0.7);
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 5]);
          ctx.beginPath();
          ctx.arc(L.x, L.y, R + 7, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        // textes (encre blanche sur la bulle colorée)
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const big = Math.max(13, Math.min(26, R * 0.27));
        if (isPool) {
          ctx.font = `700 ${Math.max(12, big * 0.85)}px system-ui, sans-serif`;
          ctx.fillText(fmt(live.current.pool), L.x, L.y - big * 0.25);
          ctx.font = `500 ${Math.max(10, big * 0.48)}px system-ui, sans-serif`;
          ctx.fillText("à répartir", L.x, L.y + big * 0.55);
        } else if (b) {
          ctx.font = `700 ${big}px system-ui, sans-serif`;
          ctx.fillText(b.nom, L.x, L.y - big * 0.62);
          ctx.font = `600 ${big * 0.66}px system-ui, sans-serif`;
          ctx.fillText(`${fmt(b.comptes)} comptes`, L.x, L.y + big * 0.35);
          ctx.font = `500 ${big * 0.5}px system-ui, sans-serif`;
          ctx.globalAlpha = 0.85;
          if (R > 52) ctx.fillText(`${fmt(b.sites)} sites · ${fmt(b.contrats)} contrats`, L.x, L.y + big * 1.05);
          ctx.globalAlpha = 1;
        }
      });

      list.forEach((p) => drawP(p, true));
    };
    raf = requestAnimationFrame(frame);

    const pick = (ev: PointerEvent | MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      let best: { kind: "body" | "p"; id: string } | null = null;
      let bestD = Infinity;
      parts.current.forEach((p) => {
        if (Math.sin(p.a) < 0 || p.alpha < 0.5) return;
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < p.size + 6 && d < bestD) {
          bestD = d;
          best = { kind: "p", id: p.key };
        }
      });
      if (!best)
        layout.current.forEach((L, id) => {
          if (Math.hypot(L.x - x, L.y - y) < L.R * 1.05) best = { kind: "body", id };
        });
      return best as { kind: "body" | "p"; id: string } | null;
    };

    const onMove = (ev: PointerEvent) => {
      const hit = pick(ev);
      hover.current = hit;
      canvas.style.cursor = hit ? "pointer" : "default";
      if (hit?.kind === "p") {
        const p = parts.current.get(hit.id)!;
        setTip({ x: ev.clientX, y: ev.clientY, title: p.label, sub: p.sub });
      } else if (hit?.kind === "body") {
        const b = live.current.bodies.find((x) => x.id === hit.id);
        setTip(
          hit.id === POOL
            ? { x: ev.clientX, y: ev.clientY, title: `${fmt(live.current.pool)} comptes à répartir`, sub: "Cliquez pour les voir" }
            : { x: ev.clientX, y: ev.clientY, title: b?.nom ?? "", sub: `Score ${fmt(b?.score ?? 0)} · cliquez pour ouvrir le portefeuille` },
        );
      } else setTip(null);
    };
    const onLeave = () => {
      hover.current = null;
      setTip(null);
    };
    const onClick = (ev: MouseEvent) => {
      const hit = pick(ev);
      if (!hit) return;
      if (hit.kind === "p") onParticle(hit.id);
      else onMember(hit.id === POOL ? null : hit.id);
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("click", onClick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("click", onClick);
    };
  }, [onMember, onParticle]);

  return (
    <div className="orbit-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} aria-label="Répartition du portefeuille : une bulle par personne, ses comptes en orbite" role="img" />
      <div className="orbit-legend">
        <span className="hide-mobile">Taille des bulles : poids du portefeuille (sites + contrats)</span>
        <span className="spacer" />
        <span className="hide-mobile">Cliquez une bulle ou un client</span>
      </div>
      <Tooltip at={tip}>
        <b>{tip?.title}</b>
        <span className="muted">{tip?.sub}</span>
      </Tooltip>
    </div>
  );
}
