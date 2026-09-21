'use strict';
const VERSJON = 4;

const { HOLES, INDEX, PIECES } = Solver;
const NS = 'http://www.w3.org/2000/svg';
const $ = s => document.querySelector(s);

// ---- Utseende (farger målt fra bildet, justert litt opp mot kameraets grå tone) ----
const A = 0.66;                       // halv bredde på en kule (flate til flate), i hullenheter
const C = A * (Math.SQRT2 - 1);
const KI = 0.56;                      // indre åttekant, andel av ytre
const COLORS = { red: '#d8392b', navy: '#2545b0', sky: '#67c6e6', orange: '#ffab3d', green: '#8fae3a' };
const OCT = [[-C, -1], [C, -1], [1, -C], [1, C], [C, 1], [-C, 1], [-1, C], [-1, -C]];
const FACET = [0.28, 0.12, -0.12, -0.30, -0.38, -0.22, -0.02, 0.20];   // lys fra oppe til venstre

function mix(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const f = Math.abs(t), tg = t > 0 ? 255 : 0;
  const ch = v => Math.round(v + (tg - v) * f);
  return '#' + ((1 << 24) | (ch(n >> 16) << 16) | (ch((n >> 8) & 255) << 8) | ch(n & 255)).toString(16).slice(1);
}
const pts = (s, dx = 0, dy = 0) => OCT.map(([x, y]) => (x * A * s + dx).toFixed(3) + ',' + (y * A * s + dy).toFixed(3)).join(' ');

function kule(color, x, y) {
  let h = `<g transform="translate(${x} ${y})">`;
  h += `<polygon points="${pts(1)}" fill="${mix(color, -0.4)}"/>`;
  for (let k = 0; k < 8; k++) {
    const o1 = OCT[k], o2 = OCT[(k + 1) % 8];
    const q = [[o1[0] * A, o1[1] * A], [o2[0] * A, o2[1] * A], [o2[0] * A * KI, o2[1] * A * KI], [o1[0] * A * KI, o1[1] * A * KI]];
    h += `<polygon points="${q.map(p => p[0].toFixed(3) + ',' + p[1].toFixed(3)).join(' ')}" fill="${mix(color, FACET[k])}"/>`;
  }
  h += `<polygon points="${pts(KI)}" fill="${mix(color, 0.05)}"/>`;
  return h + '</g>';
}

// Brettet kan vises liggende (13 kolonner bortover) eller stående (transponert), alt etter skjermen.
// (i, j) er alltid gitterkoordinater; xy() gir plassen på skjermen.
let V = false;
const xy = (i, j) => V ? [j, i] : [i, j];
const latt = (x, y) => V ? [y, x] : [x, y];

// Brikke: staver bare der brikken faktisk har dem (bars), fuger mellom diagonale naboer, så kulene.
function brikkeSvg(cells, color, prikk, bars) {
  const P = cells.map(([i, j]) => xy(i, j));
  const len = 2 - 2 * A + 0.1;
  const barCol = mix(color, -0.12), barLite = mix(color, 0.18);
  let under = '', kuler = '';
  for (const [p, q] of bars) {
    const [x0, y0] = P[p], [x1, y1] = P[q];
    const x = Math.min(x0, x1), y = Math.min(y0, y1);
    if (y0 === y1) {
      under += `<rect x="${x + A - 0.05}" y="${y - 0.16}" width="${len}" height="0.32" fill="${barCol}"/>` +
               `<rect x="${x + A - 0.05}" y="${y - 0.16}" width="${len}" height="0.08" fill="${barLite}"/>`;
    } else {
      under += `<rect x="${x - 0.16}" y="${y + A - 0.05}" width="0.32" height="${len}" fill="${barCol}"/>` +
               `<rect x="${x - 0.16}" y="${y + A - 0.05}" width="0.08" height="${len}" fill="${barLite}"/>`;
    }
  }
  for (let a = 0; a < P.length; a++) for (let b = a + 1; b < P.length; b++) {
    if (Math.abs(P[a][0] - P[b][0]) === 1 && Math.abs(P[a][1] - P[b][1]) === 1) {
      under += `<line x1="${P[a][0]}" y1="${P[a][1]}" x2="${P[b][0]}" y2="${P[b][1]}" stroke="${mix(color, -0.25)}" stroke-width="${(2 * C * A).toFixed(3)}"/>`;
    }
  }
  for (const [x, y] of P) kuler += kule(color, x, y);
  const extra = prikk ? `<circle cx="${P[0][0]}" cy="${P[0][1]}" r="0.13" fill="#fff" fill-opacity=".85"/>` : '';
  return under + kuler + extra;
}

function grenser(cells) {
  const P = cells.map(([i, j]) => xy(i, j));
  const xs = P.map(p => p[0]), ys = P.map(p => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

// Alle måter en brikke kan ligge på (dreid og speilet). Trykk går til neste.
const ORI = PIECES.map(p => Solver.orientations(p.rel, p.bars));
function nesteOri(b, cells) {
  const lst = ORI[b.id], k = Solver.key(cells, b.bars);
  const idx = lst.findIndex(o => Solver.key(o, b.bars) === k);
  return lst[(idx + 1) % lst.length].map(c => c.slice());
}

// ---- Nivåer og lagring ----
const NIVAER = [
  { id: 'fri', navn: 'Fri lek', fast: 0, tekst: 'Tomt brett. Bygg det selv.' },
  { id: 'lett', navn: 'Lett', fast: 6, tekst: '6 brikker ligger klare' },
  { id: 'middels', navn: 'Middels', fast: 4, tekst: '4 brikker ligger klare' },
  { id: 'vanskelig', navn: 'Vanskelig', fast: 3, tekst: '3 brikker ligger klare' },
  { id: 'ekspert', navn: 'Ekspert', fast: 2, tekst: 'Bare 2 brikker ligger klare' },
];
const LAGRING = 'brikkespill.v2';
let lagret = {};
try { lagret = JSON.parse(localStorage.getItem(LAGRING) || '{}'); } catch (e) { lagret = {}; }
function lagre() { try { localStorage.setItem(LAGRING, JSON.stringify(lagret)); } catch (e) { /* privat modus */ } }
const lagretFor = id => (lagret.spill && lagret.spill[id]) || null;

let nivå = NIVAER[1];
let nummer = 1;
let brikker = [];          // {id, color, cells (orientert), bars, placed:{i,j}|null, fixed}
let startBrikker = null;
let valgt = null;
let drag = null;
let seierVist = false;
let visteLøsning = false;  // en løsning fra appen teller ikke som løst oppgave
let løsningTeller = 0;
let lyd = lagret.lyd !== false;
const puzzleCache = {};

function nyBrikker() {
  return PIECES.map(p => ({ id: p.id, color: p.color, cells: p.rel.map(c => c.slice()), bars: p.bars, placed: null, fixed: false }));
}

// Opptatt-kart over kulehull og rutehull (stavene bruker rutehullene, så to staver kan ikke krysse hverandre)
function markér(occ, b) {
  for (const n of Solver.footprint(b.cells, b.bars, b.placed.i, b.placed.j)) occ[n] = 1;
}
function occupancy(utenId) {
  const occ = new Uint8Array(Solver.TOTAL);
  for (const br of brikker) if (br.placed && br.id !== utenId) markér(occ, br);
  return occ;
}
// Det brikken vil oppta om ankeret ligger i (ai, aj), eller null hvis den ikke passer:
// utenfor brettet, oppå en annen kule, eller en stav som krysser en annen stav
function passer(cells, bars, ai, aj, occ) {
  const fp = Solver.footprint(cells, bars, ai, aj);
  if (!fp) return null;
  for (const n of fp) if (occ[n]) return null;
  return fp;
}

async function startOppgave(nyttNummer, gjenopprett) {
  nummer = nyttNummer;
  seierVist = false; visteLøsning = false; $('#seier').hidden = true;
  brikker = nyBrikker();
  if (nivå.fast > 0) {
    const nøkkel = nivå.id + ':' + nummer;
    if (!puzzleCache[nøkkel]) {
      melding('Lager oppgave …', 60000);
      await new Promise(r => setTimeout(r, 30));
      puzzleCache[nøkkel] = Solver.makePuzzle(nivå.fast, nummer * 7919 + nivå.fast * 104729);
      melding('', 0);
    }
    for (const pl of puzzleCache[nøkkel].fixed) {
      const b = brikker[pl.piece];
      b.cells = pl.rel.map(c => c.slice());
      b.placed = { i: pl.anchor[0], j: pl.anchor[1] };
      b.fixed = true;
    }
  }
  startBrikker = JSON.stringify(brikker);
  if (gjenopprett && gjenopprett.length) {
    // legg tilbake det som var lagt, hvis det fortsatt er gyldig
    const prøv = JSON.parse(startBrikker);
    const occ = new Uint8Array(Solver.TOTAL);
    prøv.forEach(b => { if (b.fixed) markér(occ, b); });
    let ok = true;
    for (const s of gjenopprett) {
      const b = prøv[s.id];
      if (!b || b.fixed || !Array.isArray(s.cells) || s.cells.length !== PIECES[s.id].cells.length) { ok = false; break; }
      b.cells = s.cells;
      if (s.placed) {
        const fp = passer(b.cells, b.bars, s.placed.i, s.placed.j, occ);
        if (!fp) { ok = false; break; }
        fp.forEach(n => { occ[n] = 1; });
        b.placed = s.placed;
      }
    }
    if (ok) brikker = prøv;
  }
  valgt = null;
  tegnAlt();
  lagreSpill();
}

function lagreSpill() {
  lagret.spill = lagret.spill || {};
  const ferdig = seierVist || visteLøsning;
  lagret.spill[nivå.id] = {
    nr: seierVist ? nummer + 1 : nummer,
    brikker: ferdig ? [] : brikker.filter(b => !b.fixed).map(b => ({ id: b.id, cells: b.cells, placed: b.placed })),
  };
  lagret.sist = nivå.id;
  lagret.lyd = lyd;
  lagre();
}

// ---- Brett og brikker ----
const brett = $('#brett');
const trayEl = $('#brikker');
const flate = $('#flate');
let trayU = 20;

function brettBunn() {
  const w = V ? 7 : 14, h = V ? 14 : 7;
  let s = `<rect x="-1" y="-1" width="${w}" height="${h}" rx="0.6" fill="#efe6d2"/>` +
          `<rect x="-0.92" y="-0.92" width="${w - 0.16}" height="${h - 0.16}" rx="0.55" fill="none" stroke="#d6c9ab" stroke-width="0.06"/>`;
  const P = HOLES.map(hl => xy(hl.i, hl.j));
  for (const [x, y] of P) s += `<polygon points="${pts(1.26, x, y)}" fill="#e2d6bb"/>`;
  for (const [x, y] of P) {
    s += `<polygon points="${pts(1.04, x, y)}" fill="#cbbd9c"/>` +
         `<polygon points="${pts(0.98, x, y)}" fill="#f3ebd9"/>` +
         `<polygon points="${pts(0.62, x + 0.03, y + 0.05)}" fill="#e8dec7"/>`;
  }
  return s;
}

function byggBrett() {
  brett.setAttribute('viewBox', V ? '-1.1 -1.1 7.2 14.2' : '-1.1 -1.1 14.2 7.2');
  brett.innerHTML = brettBunn() + '<g id="lag-brikker"></g><g id="lag-forhand"></g>';
}

function tegnBrett() {
  let h = '';
  for (const b of brikker) {
    if (!b.placed) continue;
    const [x, y] = xy(b.placed.i, b.placed.j);
    h += `<g class="bp${b.fixed ? ' last' : ''}" data-p="${b.id}" transform="translate(${x} ${y})">${brikkeSvg(b.cells, COLORS[b.color], b.fixed, b.bars)}</g>`;
  }
  $('#lag-brikker').innerHTML = h;
}

function beregnSkala() {
  const u = brett.getScreenCTM().a;
  const cs = getComputedStyle(trayEl);
  const bredde = trayEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const høyde = trayEl.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  let s;
  if (flate.classList.contains('lay-P')) {
    s = høyde / 5.5;                                   // største brikke er 5,3 enheter høy
  } else {
    let areal = 0;                                     // størst mulig skala der alle ti får plass
    for (const b of brikker) {
      const g = ORI[b.id][0];
      const w = Math.max(...g.map(c => c[0])) - Math.min(...g.map(c => c[0])) + 2 * A;
      const h = Math.max(...g.map(c => c[1])) - Math.min(...g.map(c => c[1])) + 2 * A;
      areal += (Math.max(w, h) + 0.5) ** 2;
    }
    s = Math.min(Math.sqrt(Math.max(bredde, 1) * Math.max(høyde, 1) * 0.55 / areal), bredde / 5.5);
  }
  trayU = Math.max(12, Math.min(48, s, u * 1.5));
}

function tegnTray() {
  if (!brett.getScreenCTM()) return;
  beregnSkala();
  trayEl.innerHTML = '';
  const igjen = brikker.filter(b => !b.placed);
  if (!igjen.length) { trayEl.innerHTML = '<div class="tom">Alle brikkene er lagt ut 👍</div>'; return; }
  for (const b of igjen) {
    const g = grenser(b.cells), m = A + 0.12;
    const x = g.x0 - m, y = g.y0 - m, w = g.x1 - g.x0 + 2 * m, hh = g.y1 - g.y0 + 2 * m;
    const el = document.createElementNS(NS, 'svg');
    el.setAttribute('viewBox', `${x} ${y} ${w} ${hh}`);
    el.setAttribute('width', (w * trayU).toFixed(1));
    el.setAttribute('height', (hh * trayU).toFixed(1));
    el.setAttribute('class', 'brikke');
    el.dataset.p = b.id;
    el._vb = [x, y]; el._u = trayU;
    el.innerHTML = brikkeSvg(b.cells, COLORS[b.color], false, b.bars);
    trayEl.appendChild(el);
  }
}

function tegnStatus() {
  const lagt = brikker.filter(b => b.placed).length;
  $('#status').innerHTML = `<b>${nivå.navn}${nivå.fast ? ' · oppgave ' + nummer : ''}</b><span>${lagt} av 10 brikker på plass</span>`;
}

function tegnAlt() { tegnBrett(); tegnTray(); tegnStatus(); }

// Velger best plassering av brett og brikker: liggende eller stående brett, brikkene til siden eller under.
let layTid = 0;
function oppdaterLayout() {
  if ($('#spill').hidden) return;
  const W = flate.clientWidth, H = flate.clientHeight;
  if (!W || !H) return;
  const gap = 10, kand = [];
  const Tw = Math.max(200, Math.min(360, W * 0.3));
  const Th = Math.max(110, Math.min(230, H * 0.24));
  for (const v of [false, true]) {
    const bw = v ? 7.2 : 14.2, bh = v ? 14.2 : 7.2;
    kand.push({ lay: 'L', v, t: Tw, u: Math.min((W - Tw - gap) / bw, H / bh) });
    kand.push({ lay: 'P', v, t: Th, u: Math.min(W / bw, (H - Th - gap) / bh) });
  }
  // liggende brett foretrekkes hvis det er nesten like stort som det stående, og brikkene til siden hvis det koster lite
  kand.forEach(k => { k.score = k.u * (k.v ? 0.9 : 1) * (k.lay === 'L' ? 1.06 : 1); });
  const best = kand.reduce((a, b) => (b.score > a.score ? b : a));
  flate.className = 'lay-' + best.lay;
  flate.style.setProperty('--t', best.t + 'px');
  const skift = best.v !== V || !brett.firstChild;
  V = best.v;
  if (skift) { byggBrett(); tegnBrett(); }
  tegnTray();
}

// ---- Lyd og meldinger ----
let ctx = null;
function tone(f, start, dur, type = 'sine', vol = 0.12) {
  if (!lyd) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    const t = ctx.currentTime + start;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  } catch (e) { /* ingen lyd */ }
}
const lydKlikk = () => { tone(520, 0, 0.07, 'triangle'); tone(330, 0.03, 0.09, 'triangle'); };
const lydDreie = () => tone(660, 0, 0.05, 'square', 0.04);
const lydSeier = () => [523, 659, 784, 1047].forEach((f, k) => tone(f, k * 0.12, 0.3, 'triangle', 0.14));

let meldingTid = 0;
function melding(tekst, ms = 2600) {
  const el = $('#melding');
  clearTimeout(meldingTid);
  if (!tekst) { el.classList.remove('vis'); return; }
  el.textContent = tekst; el.classList.add('vis');
  meldingTid = setTimeout(() => el.classList.remove('vis'), ms);
}

function bekreft(tekst) {
  return new Promise(res => {
    $('#dialogTekst').textContent = tekst;
    $('#dialog').hidden = false;
    const ferdig = v => { $('#dialog').hidden = true; res(v); };
    $('#dialogJa').onclick = () => ferdig(true);
    $('#dialogNei').onclick = () => ferdig(false);
  });
}

// ---- Dra og slipp ----
function skjermTilBrett(x, y) {
  const m = brett.getScreenCTM();
  const p = new DOMPoint(x, y).matrixTransform(m.inverse());
  return { x: p.x, y: p.y, u: m.a };
}

// Nærmeste kule i brikken til et punkt (skjermkoordinater relativt til ankeret)
function nærmesteIdx(b, dx, dy) {
  let best = 0, bd = Infinity;
  b.cells.forEach(([i, j], k) => { const [x, y] = xy(i, j); const d = (x - dx) ** 2 + (y - dy) ** 2; if (d < bd) { bd = d; best = k; } });
  return best;
}

document.addEventListener('pointerdown', e => {
  const el = e.target.closest && e.target.closest('[data-p]');
  if (!el || drag || e.button > 0) return;
  const b = brikker[+el.dataset.p];
  if (e.pointerType === 'mouse') e.preventDefault();
  if (b.fixed) { el.classList.remove('rist'); void el.getBoundingClientRect(); el.classList.add('rist'); melding('Den brikken er låst – den hører til oppgaven'); return; }
  valgt = b.id;
  let gk;
  if (b.placed) {
    const p = skjermTilBrett(e.clientX, e.clientY), [ax, ay] = xy(b.placed.i, b.placed.j);
    gk = nærmesteIdx(b, p.x - ax, p.y - ay);
  } else {
    const r = el.getBoundingClientRect();
    gk = nærmesteIdx(b, el._vb[0] + (e.clientX - r.left) / el._u, el._vb[1] + (e.clientY - r.top) / el._u);
  }
  drag = { b, el, gk, id: e.pointerId, x0: e.clientX, y0: e.clientY, flyttet: false, snap: null, ghost: null,
           lift: e.pointerType === 'touch' ? 1.5 : 0 };
});

window.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  if (!drag.flyttet) {
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 8) return;
    startTrekk();
  }
  flyttTrekk(e.clientX, e.clientY);
});

function startTrekk() {
  drag.flyttet = true;
  if (drag.b.placed) drag.b.placed = null;
  drag.el.style.visibility = 'hidden';
  tegnStatus();
  bygSpøkelse();
}

function bygSpøkelse() {
  if (drag.ghost) drag.ghost.remove();
  const b = drag.b, u = skjermTilBrett(0, 0).u;
  const g = grenser(b.cells), m = A + 0.12;
  const x = g.x0 - m, y = g.y0 - m, w = g.x1 - g.x0 + 2 * m, h = g.y1 - g.y0 + 2 * m;
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
  el.setAttribute('width', (w * u).toFixed(1));
  el.setAttribute('height', (h * u).toFixed(1));
  el.setAttribute('class', 'spøkelse');
  el.innerHTML = brikkeSvg(b.cells, COLORS[b.color], false, b.bars);
  document.body.appendChild(el);
  drag.ghost = el;
  drag.u = u;
  const [gx, gy] = xy(...b.cells[drag.gk]);
  drag.gx = (gx - x) * u; drag.gy = (gy - y) * u;
  if (drag.px !== undefined) flyttTrekk(drag.px, drag.py);
}

function flyttTrekk(cx, cy) {
  drag.px = cx; drag.py = cy;
  const ty = cy - drag.lift * drag.u;
  drag.ghost.style.transform = `translate(${(cx - drag.gx).toFixed(1)}px, ${(ty - drag.gy).toFixed(1)}px)`;
  // nærmeste gyldige feste, regnet i gitterkoordinater
  const p = skjermTilBrett(cx, ty);
  const [pi, pj] = latt(p.x, p.y);
  const g = drag.b.cells[drag.gk];
  const occ = occupancy(drag.b.id);
  const kand = [];
  for (let j = Math.floor(pj) - 1; j <= Math.ceil(pj) + 1; j++) {
    for (let i = Math.floor(pi) - 1; i <= Math.ceil(pi) + 1; i++) {
      if (INDEX[i + ',' + j] === undefined) continue;
      kand.push({ i, j, d: Math.hypot(i - pi, j - pj) });
    }
  }
  kand.sort((a, b) => a.d - b.d);
  let snap = null;
  for (const k of kand) {
    if (k.d > 1.7) break;
    const ai = k.i - g[0], aj = k.j - g[1];
    if (passer(drag.b.cells, drag.b.bars, ai, aj, occ)) { snap = { i: ai, j: aj }; break; }
  }
  const forrige = drag.snap;
  drag.snap = snap;
  if (!forrige || !snap || forrige.i !== snap.i || forrige.j !== snap.j) tegnForhåndsvisning();
}

function tegnForhåndsvisning() {
  const lag = $('#lag-forhand');
  if (!drag || !drag.snap) { lag.innerHTML = ''; return; }
  const b = drag.b, s = drag.snap;
  const [ox, oy] = xy(s.i, s.j);
  lag.innerHTML = `<g transform="translate(${ox} ${oy})" opacity=".55">` +
    b.cells.map(([i, j]) => { const [x, y] = xy(i, j); return `<polygon points="${pts(1.08, x, y)}" fill="#fff" stroke="${COLORS[b.color]}" stroke-width=".1"/>`; }).join('') + '</g>';
}

window.addEventListener('pointerup', e => { if (drag && e.pointerId === drag.id) slipp(true); });
window.addEventListener('pointercancel', e => { if (drag && e.pointerId === drag.id) slipp(false); });

function slipp(ok) {
  const d = drag; drag = null;
  $('#lag-forhand').innerHTML = '';
  if (d.ghost) d.ghost.remove();
  const b = d.b;
  if (!d.flyttet) {
    if (ok) trykk(b, d);       // et trykk snur brikken
    return;
  }
  if (ok && d.snap) { b.placed = d.snap; lydKlikk(); }
  else b.placed = null;         // tilbake til brikkene ved siden av
  tegnAlt(); lagreSpill();
  sjekkSeier();
}

// Snu en brikke til neste orientering. På brettet holdes cellen du trykket på (eller en annen) på plass,
// og det prøves videre til en orientering som får plass.
function snuPåBrett(b, pivotIdx) {
  const occ = occupancy(b.id);
  const mi = b.cells.reduce((s, c) => s + c[0], 0) / b.cells.length, mj = b.cells.reduce((s, c) => s + c[1], 0) / b.cells.length;
  const rekke = b.cells.map((c, k) => k).sort((a, c) => {
    if (a === pivotIdx) return -1; if (c === pivotIdx) return 1;
    return Math.hypot(b.cells[a][0] - mi, b.cells[a][1] - mj) - Math.hypot(b.cells[c][0] - mi, b.cells[c][1] - mj);
  });
  let cur = b.cells;
  for (let steg = 0; steg < ORI[b.id].length; steg++) {
    cur = nesteOri(b, cur);
    for (const k of rekke) {
      const ai = b.placed.i + b.cells[k][0] - cur[k][0], aj = b.placed.j + b.cells[k][1] - cur[k][1];
      if (passer(cur, b.bars, ai, aj, occ)) { b.cells = cur; b.placed = { i: ai, j: aj }; return true; }
    }
  }
  return false;
}

function trykk(b, d) {
  if (b.placed) {
    if (snuPåBrett(b, d.gk)) lydDreie();
    else { rist(b); melding('Det er ikke plass til å snu den her'); }
  } else {
    b.cells = nesteOri(b, b.cells);
    lydDreie();
  }
  tegnAlt(); lagreSpill();
}

function rist(b) {
  const el = brett.querySelector(`.bp[data-p="${b.id}"]`);
  if (el) { el.classList.remove('rist'); void el.getBBox(); el.classList.add('rist'); }
}

// PC: R snur brikken du drar (eller den sist valgte), høyreklikk og musehjul likså
function snuValgt() {
  if (drag && drag.flyttet) {
    drag.b.cells = nesteOri(drag.b, drag.b.cells);
    drag.snap = null;
    bygSpøkelse(); lydDreie();
    return;
  }
  const b = brikker.find(x => x.id === valgt);
  if (!b || b.fixed || $('#spill').hidden) return;
  if (b.placed) { if (!snuPåBrett(b, 0)) { rist(b); return; } }
  else b.cells = nesteOri(b, b.cells);
  lydDreie(); tegnAlt(); lagreSpill();
}
window.addEventListener('keydown', e => { if (e.key === 'r' || e.key === 'R') snuValgt(); });
window.addEventListener('contextmenu', e => { if (drag) { e.preventDefault(); snuValgt(); } });
window.addEventListener('wheel', e => { if (drag && drag.flyttet) snuValgt(); }, { passive: true });

// ---- Ny løsning: legger alle brikkene, tilfeldig hver gang ----
$('#losning').onclick = () => {
  const occ = new Uint8Array(Solver.TOTAL);
  for (const b of brikker) if (b.fixed) markér(occ, b);
  const igjen = brikker.filter(b => !b.fixed).map(b => b.id);
  const r = Solver.solveRandom(occ, igjen, Math.random);
  if (!r.first) { melding('Fant ingen løsning', 2400); return; }
  for (const b of brikker) if (!b.fixed) b.placed = null;
  for (const pl of r.first) {
    const b = brikker[pl.piece];
    b.cells = pl.rel.map(c => c.slice());
    b.placed = { i: pl.anchor[0], j: pl.anchor[1] };
  }
  valgt = null; visteLøsning = true; løsningTeller++;
  lydKlikk();
  tegnAlt(); lagreSpill();
  const tom = HOLES.find((h, n) => !occupancy()[n]);
  melding(`Løsning ${løsningTeller} – trykk ✨ igjen for en ny. Tomt hull: rad ${tom.j + 1}.`, 3600);
};

// ---- Seier ----
function sjekkSeier() {
  if (seierVist || visteLøsning || brikker.some(b => !b.placed)) return;
  seierVist = true;
  if (nivå.fast) lagret.løst = (lagret.løst || 0) + 1;
  lagreSpill();
  tegnStatus();
  $('#seierTekst').textContent = nivå.fast
    ? `Alle ti brikkene ligger på plass. Du har løst ${lagret.løst} oppgave${lagret.løst === 1 ? '' : 'r'}.`
    : 'Alle ti brikkene ligger på plass!';
  $('#nesteOppgave').textContent = nivå.fast ? 'Neste oppgave' : 'Nytt brett';
  setTimeout(() => { $('#seier').hidden = false; lydSeier(); konfetti(); }, 350);
}

function konfetti() {
  const cv = $('#konfetti'), c = cv.getContext('2d');
  cv.width = innerWidth; cv.height = innerHeight;
  const farger = Object.values(COLORS);
  const ps = Array.from({ length: 140 }, () => ({
    x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * 0.6, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4,
    s: 6 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, c: farger[(Math.random() * farger.length) | 0] }));
  let n = 0;
  (function fram() {
    if ($('#seier').hidden || n++ > 400) { c.clearRect(0, 0, cv.width, cv.height); return; }
    c.clearRect(0, 0, cv.width, cv.height);
    for (const p of ps) {
      p.x += p.vx; p.y += p.vy; p.r += p.vr;
      c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.fillStyle = p.c; c.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); c.restore();
    }
    requestAnimationFrame(fram);
  })();
}

// ---- Nytt spill ----
async function nyttSpill() {
  const egne = brikker.filter(b => b.placed && !b.fixed).length;
  if (egne >= 2 && !seierVist && !visteLøsning && !(await bekreft('Vil du starte et nytt spill? Det du har lagt nå går tapt.'))) return;
  await startOppgave(nivå.fast ? nummer + 1 : 1, null);
}
$('#ny').onclick = nyttSpill;
$('#nesteOppgave').onclick = () => { $('#seier').hidden = true; startOppgave(nivå.fast ? nummer + 1 : 1, null); };
$('#lukkSeier').onclick = () => { $('#seier').hidden = true; };
$('#seierHjem').onclick = () => { $('#seier').hidden = true; tilbake(); };

// ---- Startside ----
function miniIkon(fast) {
  let s = '';
  PIECES.forEach((p, k) => {
    const x = (k % 5) * 1.5 + 0.7, y = Math.floor(k / 5) * 1.5 + 0.7;
    s += k < fast ? kule(COLORS[p.color], x, y)
                  : `<polygon points="${pts(1, x, y)}" fill="#2c2940" stroke="#4a4463" stroke-width=".08"/>`;
  });
  return `<svg viewBox="0 0 7.5 3.1" aria-hidden="true">${s}</svg>`;
}

function logoSvg() {
  const gammel = V; V = false;
  let s = brettBunn();
  for (const p of PIECES) s += `<g transform="translate(${p.cells[0][0]} ${p.cells[0][1]})">${brikkeSvg(p.rel, COLORS[p.color], false, p.bars)}</g>`;
  V = gammel;
  return `<svg viewBox="-1.1 -1.1 14.2 7.2">${s}</svg>`;
}

function tegnHjem() {
  $('#logo').innerHTML = logoSvg();
  const kort = $('#kort');
  kort.innerHTML = '';
  for (const n of NIVAER) {
    const lag = lagretFor(n.id);
    const k = document.createElement('button');
    k.setAttribute('role', 'listitem');
    const nr = lag && lag.nr > 1 && n.fast ? ` · oppgave ${lag.nr}` : '';
    k.innerHTML = miniIkon(n.fast) + `<span><span class="navn">${n.navn}</span><br><span class="sub">${n.tekst}${nr}</span></span>`;
    k.onclick = () => start(n);
    kort.appendChild(k);
  }
  const sist = NIVAER.find(n => n.id === lagret.sist), lagSist = sist && lagretFor(sist.id);
  const fortsett = $('#fortsett');
  if (sist && lagSist && lagSist.brikker && lagSist.brikker.some(b => b.placed)) {
    fortsett.hidden = false;
    fortsett.textContent = `Fortsett: ${sist.navn}${sist.fast ? ', oppgave ' + lagSist.nr : ''}`;
    fortsett.onclick = () => start(sist);
  } else fortsett.hidden = true;
  $('#loststat').textContent = lagret.løst ? `Løst: ${lagret.løst}` : '';
  $('#lyd').textContent = lyd ? '🔊' : '🔇';
}

async function start(n) {
  nivå = n;
  const lag = lagretFor(n.id);
  $('#hjem').hidden = true; $('#spill').hidden = false;
  history.pushState({ spill: 1 }, '');
  oppdaterLayout();
  await startOppgave(lag ? lag.nr : 1, lag ? lag.brikker : null);
  oppdaterLayout();
}

function tilbake() {
  if (history.state && history.state.spill) history.back();
  else visHjem();
}
function visHjem() {
  if (drag) { if (drag.ghost) drag.ghost.remove(); drag = null; }
  $('#spill').hidden = true; $('#seier').hidden = true; $('#hjem').hidden = false;
  tegnHjem();
}
window.addEventListener('popstate', visHjem);
$('#tilbake').onclick = tilbake;

$('#hjelp').onclick = () => { $('#regler').hidden = false; };
$('#lukkRegler').onclick = () => { $('#regler').hidden = true; lagret.sett = true; lagre(); };
$('#lyd').onclick = () => { lyd = !lyd; $('#lyd').textContent = lyd ? '🔊' : '🔇'; lagre(); if (lyd) lydKlikk(); };

new ResizeObserver(() => { clearTimeout(layTid); layTid = setTimeout(() => { if (!drag) oppdaterLayout(); }, 60); }).observe(flate);

// ---- Start ----
tegnHjem();
if (!lagret.sett) $('#regler').hidden = false;

// ---- Service worker: hent ny versjon og last siden på nytt når den tar over ----
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadde = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadde && !drag) location.reload(); });
}
