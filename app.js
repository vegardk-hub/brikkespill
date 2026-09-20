'use strict';
const VERSJON = 2;

const { HOLES, INDEX, PIECES, COLS, ROWS } = Solver;
const NS = 'http://www.w3.org/2000/svg';
const $ = s => document.querySelector(s);

// ---- Utseende (farger målt fra bildet, justert litt opp mot kamerats grå tone) ----
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

// Brikke: staver mellom (±2,0)/(0,±2), fuger mellom diagonale naboer, så kulene.
function brikkeSvg(cells, color, prikk) {
  const set = new Set(cells.map(c => c[0] + ',' + c[1]));
  let under = '', kuler = '';
  const barCol = mix(color, -0.12), barLite = mix(color, 0.18);
  for (const [i, j] of cells) {
    if (set.has((i + 2) + ',' + j)) {
      under += `<rect x="${i + A - 0.05}" y="${j - 0.16}" width="${2 - 2 * A + 0.1}" height="0.32" fill="${barCol}"/>` +
               `<rect x="${i + A - 0.05}" y="${j - 0.16}" width="${2 - 2 * A + 0.1}" height="0.08" fill="${barLite}"/>`;
    }
    if (set.has(i + ',' + (j + 2))) {
      under += `<rect x="${i - 0.16}" y="${j + A - 0.05}" width="0.32" height="${2 - 2 * A + 0.1}" fill="${barCol}"/>` +
               `<rect x="${i - 0.16}" y="${j + A - 0.05}" width="0.08" height="${2 - 2 * A + 0.1}" fill="${barLite}"/>`;
    }
    for (const dj of [1]) for (const di of [1, -1]) {
      if (set.has((i + di) + ',' + (j + dj))) {
        under += `<line x1="${i}" y1="${j}" x2="${i + di}" y2="${j + dj}" stroke="${mix(color, -0.25)}" stroke-width="${(2 * C * A).toFixed(3)}"/>`;
      }
    }
  }
  for (const [i, j] of cells) kuler += kule(color, i, j);
  let extra = '';
  if (prikk) extra = `<circle cx="${cells[0][0]}" cy="${cells[0][1]}" r="0.13" fill="#fff" fill-opacity=".85"/>`;
  return under + kuler + extra;
}

function grenser(cells) {
  const is = cells.map(c => c[0]), js = cells.map(c => c[1]);
  return { i0: Math.min(...is), i1: Math.max(...is), j0: Math.min(...js), j1: Math.max(...js) };
}

// ---- Tilstand ----
const NIVAER = [
  { id: 'fri', navn: 'Fri lek', fast: 0 },
  { id: 'lett', navn: 'Lett', fast: 6 },
  { id: 'middels', navn: 'Middels', fast: 4 },
  { id: 'vanskelig', navn: 'Vanskelig', fast: 3 },
  { id: 'ekspert', navn: 'Ekspert', fast: 2 },
];
const LAGRING = 'brikkespill.v1';
let lagret = {};
try { lagret = JSON.parse(localStorage.getItem(LAGRING) || '{}'); } catch (e) { lagret = {}; }
function lagre() { try { localStorage.setItem(LAGRING, JSON.stringify(lagret)); } catch (e) { /* privat modus */ } }

let nivå = NIVAER.find(n => n.id === lagret.nivå) || NIVAER[1];
let nummer = 1;
let brikker = [];          // {id, color, cells (orientert), placed:{i,j}|null, fixed}
let startBrikker = null;   // for Nullstill
let valgt = null;          // id
let hintPl = null;
let drag = null;
let seierVist = false;
let visteLøsning = false;   // en løsning fra appen teller ikke som løst oppgave
let løsningTeller = 0;
let lyd = lagret.lyd !== false;
const puzzleCache = {};

const nr = () => (lagret.nr && lagret.nr[nivå.id]) || 1;

function nyBrikker() {
  return PIECES.map(p => ({ id: p.id, color: p.color, cells: p.rel.map(c => c.slice()), placed: null, fixed: false }));
}

function occupancy(utenId) {
  const occ = new Uint8Array(HOLES.length);
  for (const b of brikker) {
    if (!b.placed || b.id === utenId) continue;
    for (const [di, dj] of b.cells) occ[INDEX[(b.placed.i + di) + ',' + (b.placed.j + dj)]] = 1;
  }
  return occ;
}
// Hull-nummer for cellene om brikken ligger med ankeret i (ai, aj), eller null hvis noe ikke passer
function passer(cells, ai, aj, occ) {
  const out = [];
  for (const [di, dj] of cells) {
    const n = INDEX[(ai + di) + ',' + (aj + dj)];
    if (n === undefined || occ[n]) return null;
    out.push(n);
  }
  return out;
}

async function startOppgave(nyttNummer, gjenopprett) {
  nummer = nyttNummer;
  hintPl = null; seierVist = false; visteLøsning = false; $('#seier').hidden = true;
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
    // legg tilbake det barnet hadde lagt, hvis det fortsatt er gyldig
    const prøv = JSON.parse(JSON.stringify(brikker));
    const occ = new Uint8Array(HOLES.length);
    prøv.forEach(b => { if (b.fixed) for (const [di, dj] of b.cells) occ[INDEX[(b.placed.i + di) + ',' + (b.placed.j + dj)]] = 1; });
    let ok = true;
    for (const s of gjenopprett) {
      const b = prøv[s.id];
      if (!b || b.fixed || !Array.isArray(s.cells) || s.cells.length !== PIECES[s.id].cells.length) { ok = false; break; }
      b.cells = s.cells;
      if (s.placed) {
        const hull = passer(b.cells, s.placed.i, s.placed.j, occ);
        if (!hull) { ok = false; break; }
        hull.forEach(n => { occ[n] = 1; });
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
  lagret.nivå = nivå.id;
  lagret.nr = lagret.nr || {};
  lagret.nr[nivå.id] = nummer;
  lagret.brikker = brikker.filter(b => !b.fixed).map(b => ({ id: b.id, cells: b.cells, placed: b.placed }));
  lagret.lyd = lyd;
  lagre();
}

// ---- Tegning ----
const brett = $('#brett');
const trayEl = $('#brikker');
let trayU = 20;

function byggBrett() {
  let h = `<rect x="-1" y="-1" width="14" height="7" rx="0.6" fill="#efe6d2"/>` +
          `<rect x="-0.92" y="-0.92" width="13.84" height="6.84" rx="0.55" fill="none" stroke="#d6c9ab" stroke-width="0.06"/>`;
  for (const hl of HOLES) h += `<polygon points="${pts(1.26, hl.i, hl.j)}" fill="#e2d6bb"/>`;
  for (const hl of HOLES) {
    h += `<polygon points="${pts(1.04, hl.i, hl.j)}" fill="#cbbd9c"/>` +
         `<polygon points="${pts(0.98, hl.i, hl.j)}" fill="#f3ebd9"/>` +
         `<polygon points="${pts(0.62, hl.i + 0.03, hl.j + 0.05)}" fill="#e8dec7"/>`;
  }
  h += '<g id="lag-brikker"></g><g id="lag-forhand"></g><g id="lag-hint"></g>';
  brett.innerHTML = h;
}

function tegnBrett() {
  let h = '';
  for (const b of brikker) {
    if (!b.placed) continue;
    h += `<g class="bp${b.fixed ? ' last' : ''}${valgt === b.id ? ' valgt' : ''}" data-p="${b.id}" transform="translate(${b.placed.i} ${b.placed.j})">${brikkeSvg(b.cells, COLORS[b.color], b.fixed)}</g>`;
  }
  $('#lag-brikker').innerHTML = h;
  let hint = '';
  if (hintPl) {
    hint = '<g class="hintform">' + hintPl.cells.map(n => `<polygon points="${pts(1, HOLES[n].i, HOLES[n].j)}"/>`).join('') + '</g>';
  }
  $('#lag-hint').innerHTML = hint;
}

function beregnSkala() {
  const u = brett.getScreenCTM().a;
  const cs = getComputedStyle(trayEl);
  const bredde = trayEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const høyde = trayEl.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  // størst mulig skala der alle brikkene som er igjen fortsatt får plass
  let areal = 0, bred = 0;
  for (const b of brikker) {
    if (b.placed) continue;
    const g = grenser(b.cells), m = A + 0.12;
    const w = g.i1 - g.i0 + 2 * m, h = g.j1 - g.j0 + 2 * m;
    areal += (w + 0.6) * (h + 0.4); bred = Math.max(bred, w, h);
  }
  let s = Math.sqrt(Math.max(bredde, 1) * Math.max(høyde, 1) * 0.62 / Math.max(areal, 1));
  s = Math.min(s, bredde / Math.max(bred, 1), u * 1.5);
  trayU = Math.max(13, Math.min(48, s));
}

function tegnTray() {
  beregnSkala();
  trayEl.innerHTML = '';
  const igjen = brikker.filter(b => !b.placed);
  if (!igjen.length) {
    trayEl.innerHTML = '<div class="tom">Alle brikkene er lagt ut 👍</div>';
    return;
  }
  for (const b of igjen) {
    const g = grenser(b.cells);
    const m = A + 0.12;
    const x = g.i0 - m, y = g.j0 - m, w = g.i1 - g.i0 + 2 * m, hh = g.j1 - g.j0 + 2 * m;
    const el = document.createElementNS(NS, 'svg');
    el.setAttribute('viewBox', `${x} ${y} ${w} ${hh}`);
    el.setAttribute('width', (w * trayU).toFixed(1));
    el.setAttribute('height', (hh * trayU).toFixed(1));
    el.setAttribute('class', 'brikke' + (valgt === b.id ? ' valgt' : ''));
    el.dataset.p = b.id;
    el._vb = [x, y]; el._u = trayU;
    el.innerHTML = brikkeSvg(b.cells, COLORS[b.color]);
    trayEl.appendChild(el);
  }
}

function tegnStatus() {
  const lagt = brikker.filter(b => b.placed).length;
  $('#status').textContent = (nivå.fast ? `Oppgave ${nummer}` : 'Fri lek') + ` · ${lagt}/10`;
  const nivåEl = $('#nivaer');
  nivåEl.querySelectorAll('button').forEach(k => k.setAttribute('aria-selected', String(k.dataset.id === nivå.id)));
  $('#ny').textContent = nivå.fast ? 'Ny oppgave' : 'Tøm brettet';
}

function tegnAlt() { tegnBrett(); tegnTray(); tegnStatus(); }

// ---- Lyd ----
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

// ---- Dra og slipp ----
function skjermTilBrett(x, y) {
  const m = brett.getScreenCTM();
  const p = new DOMPoint(x, y).matrixTransform(m.inverse());
  return { x: p.x, y: p.y, u: m.a };
}

function nærmesteCelle(b, px, py) {
  let best = 0, bd = Infinity;
  b.cells.forEach(([i, j], k) => { const d = (i - px) ** 2 + (j - py) ** 2; if (d < bd) { bd = d; best = k; } });
  return b.cells[best].slice();
}

document.addEventListener('pointerdown', e => {
  const el = e.target.closest && e.target.closest('[data-p]');
  if (!el || drag || e.button > 0) return;
  const b = brikker[+el.dataset.p];
  e.preventDefault();
  if (b.fixed) { el.classList.remove('rist'); void el.getBoundingClientRect(); el.classList.add('rist'); melding('Den brikken er låst – den hører til oppgaven'); return; }
  valgt = b.id;
  let g;
  if (b.placed) {
    const p = skjermTilBrett(e.clientX, e.clientY);
    g = nærmesteCelle(b, p.x - b.placed.i, p.y - b.placed.j);
  } else {
    const r = el.getBoundingClientRect();
    g = nærmesteCelle(b, el._vb[0] + (e.clientX - r.left) / el._u, el._vb[1] + (e.clientY - r.top) / el._u);
  }
  drag = { b, el, g, id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), flyttet: false,
           fraBrett: !!b.placed, ankerFør: b.placed, cellerFør: b.cells, snap: null, ghost: null,
           lift: e.pointerType === 'touch' ? 1.5 : 0 };
  hintPl = null;
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
  const b = drag.b;
  if (b.placed) { b.placed = null; }
  drag.el.style.visibility = 'hidden';
  tegnStatus();
  bygSpøkelse();
}

function bygSpøkelse() {
  if (drag.ghost) drag.ghost.remove();
  const b = drag.b, u = skjermTilBrett(0, 0).u;
  const g = grenser(b.cells), m = A + 0.12;
  const x = g.i0 - m, y = g.j0 - m, w = g.i1 - g.i0 + 2 * m, h = g.j1 - g.j0 + 2 * m;
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
  el.setAttribute('width', (w * u).toFixed(1));
  el.setAttribute('height', (h * u).toFixed(1));
  el.setAttribute('class', 'spøkelse');
  el.innerHTML = brikkeSvg(b.cells, COLORS[b.color]);
  document.body.appendChild(el);
  drag.ghost = el;
  drag.u = u;
  // hvor i spøkelset den grepne cellen ligger, i px
  drag.gx = (drag.g[0] - x) * u; drag.gy = (drag.g[1] - y) * u;
  if (drag.px !== undefined) flyttTrekk(drag.px, drag.py);
}

function flyttTrekk(cx, cy) {
  drag.px = cx; drag.py = cy;
  const ty = cy - drag.lift * drag.u;
  drag.ghost.style.transform = `translate(${(cx - drag.gx).toFixed(1)}px, ${(ty - drag.gy).toFixed(1)}px)`;
  // finn nærmeste gyldige feste
  const p = skjermTilBrett(cx, ty);
  const occ = occupancy(drag.b.id);
  const kand = [];
  for (let j = Math.floor(p.y) - 1; j <= Math.ceil(p.y) + 1; j++) {
    for (let i = Math.floor(p.x) - 1; i <= Math.ceil(p.x) + 1; i++) {
      if (INDEX[i + ',' + j] === undefined) continue;
      kand.push({ i, j, d: Math.hypot(i - p.x, j - p.y) });
    }
  }
  kand.sort((a, b) => a.d - b.d);
  let snap = null;
  for (const k of kand) {
    if (k.d > 1.7) break;
    const ai = k.i - drag.g[0], aj = k.j - drag.g[1];
    if (passer(drag.b.cells, ai, aj, occ)) { snap = { i: ai, j: aj }; break; }
  }
  const forrige = drag.snap;
  drag.snap = snap;
  if (!forrige || !snap || forrige.i !== snap.i || forrige.j !== snap.j) tegnForhåndsvisning();
}

function tegnForhåndsvisning() {
  const lag = $('#lag-forhand');
  if (!drag || !drag.snap) { lag.innerHTML = ''; return; }
  const b = drag.b, s = drag.snap;
  lag.innerHTML = `<g transform="translate(${s.i} ${s.j})" opacity=".55">` +
    b.cells.map(([i, j]) => `<polygon points="${pts(1.08, i, j)}" fill="#fff" stroke="${COLORS[b.color]}" stroke-width=".1"/>`).join('') + '</g>';
}

window.addEventListener('pointerup', e => { if (drag && e.pointerId === drag.id) slipp(true); });
window.addEventListener('pointercancel', e => { if (drag && e.pointerId === drag.id) slipp(false); });

function slipp(ok) {
  const d = drag; drag = null;
  $('#lag-forhand').innerHTML = '';
  if (d.ghost) d.ghost.remove();
  const b = d.b;
  if (!d.flyttet) {
    // et trykk: roter
    if (ok) trykk(b, d);
    return;
  }
  if (ok && d.snap) {
    b.placed = d.snap;
    lydKlikk();
  } else {
    b.placed = null;   // tilbake i brettet ved siden av
  }
  tegnAlt(); lagreSpill();
  sjekkSeier();
}

// Trykk på en brikke roterer den (på brettet: rundt cellen som ble trykket, hvis det er plass)
function trykk(b, d) {
  if (b.placed) {
    const occ = occupancy(b.id);
    if (!roterPåBrett(b, d.g, occ, c => Solver.rotate(c))) { rist(b); melding('Det er ikke plass til å rotere her'); }
  } else {
    b.cells = Solver.rotate(b.cells);
    lydDreie();
  }
  tegnAlt(); lagreSpill();
}

function rist(b) {
  const el = brett.querySelector(`.bp[data-p="${b.id}"]`);
  if (el) { el.classList.remove('rist'); void el.getBBox(); el.classList.add('rist'); }
}

// Transformer en brikke som ligger på brettet. Prøver først den oppgitte cellen som dreiepunkt,
// deretter de andre cellene (de nærmeste midten først).
function roterPåBrett(b, pivot, occ, fn) {
  const nye = fn(b.cells);
  const gammelIdx = b.cells.findIndex(c => c[0] === pivot[0] && c[1] === pivot[1]);
  const kandidater = b.cells.map((c, k) => k);
  const mi = b.cells.reduce((s, c) => s + c[0], 0) / b.cells.length, mj = b.cells.reduce((s, c) => s + c[1], 0) / b.cells.length;
  kandidater.sort((a, c) => {
    if (a === gammelIdx) return -1; if (c === gammelIdx) return 1;
    return Math.hypot(b.cells[a][0] - mi, b.cells[a][1] - mj) - Math.hypot(b.cells[c][0] - mi, b.cells[c][1] - mj);
  });
  for (const k of kandidater) {
    const gammel = b.cells[k], ny = nye[k];
    const ai = b.placed.i + gammel[0] - ny[0], aj = b.placed.j + gammel[1] - ny[1];
    if (passer(nye, ai, aj, occ)) { b.cells = nye; b.placed = { i: ai, j: aj }; lydDreie(); return true; }
  }
  return false;
}

function transformer(fn, drei) {
  if (drag && drag.flyttet) {
    drag.b.cells = fn(drag.b.cells);
    drag.g = fn([drag.g])[0];
    drag.snap = null;
    bygSpøkelse(); lydDreie();
    return;
  }
  const b = brikker.find(x => x.id === valgt);
  if (!b) { melding('Trykk på en brikke først'); return; }
  if (b.fixed) { melding('Den brikken er låst'); return; }
  if (b.placed) {
    if (!roterPåBrett(b, b.cells[0], occupancy(b.id), fn)) { rist(b); melding('Det er ikke plass her – flytt brikken først'); return; }
  } else { b.cells = fn(b.cells); lydDreie(); }
  hintPl = null;
  tegnAlt(); lagreSpill();
}

$('#roter').onclick = () => transformer(Solver.rotate);
$('#vend').onclick = () => transformer(Solver.mirror);
window.addEventListener('keydown', e => {
  if (e.key === 'r' || e.key === 'R') transformer(Solver.rotate);
  else if (e.key === 'f' || e.key === 'F') transformer(Solver.mirror);
});
window.addEventListener('contextmenu', e => { if (drag) { e.preventDefault(); transformer(Solver.rotate); } });
window.addEventListener('wheel', e => { if (drag && drag.flyttet) { transformer(Solver.rotate); } }, { passive: true });

// ---- Hint ----
$('#hint').onclick = () => {
  const igjen = brikker.filter(b => !b.placed).map(b => b.id);
  if (!igjen.length) { melding('Alle brikkene er lagt ut'); return; }
  const r = Solver.solve(occupancy(), igjen, { limit: 1 });
  if (!r.first) {
    melding(r.gaveUp ? 'Jeg klarte ikke å regne det ut – prøv å ta bort en brikke' : 'Med disse brikkene går det ikke opp – ta bort en av dem som ikke er låst', 3800);
    return;
  }
  // vis brikken som har færrest muligheter først: den største
  const pl = r.first.slice().sort((a, b) => PIECES[b.piece].cells.length - PIECES[a.piece].cells.length)[0];
  hintPl = pl;
  tegnBrett();
  const trekk = trayEl.querySelector(`[data-p="${pl.piece}"]`);
  if (trekk) { trekk.classList.remove('hintblink'); void trekk.getBoundingClientRect(); trekk.classList.add('hintblink'); }
  melding('Prøv denne brikken her', 3200);
};

// ---- Ny løsning: legger alle brikkene, tilfeldig hver gang ----
$('#losning').onclick = () => {
  const faste = brikker.filter(b => b.fixed);
  const occ = new Uint8Array(HOLES.length);
  for (const b of faste) for (const [di, dj] of b.cells) occ[INDEX[(b.placed.i + di) + ',' + (b.placed.j + dj)]] = 1;
  const igjen = brikker.filter(b => !b.fixed).map(b => b.id);
  const r = Solver.solve(occ, igjen, { rnd: Math.random, limit: 1 });
  if (!r.first) { melding('Fant ingen løsning', 2400); return; }
  for (const b of brikker) if (!b.fixed) b.placed = null;
  for (const pl of r.first) {
    const b = brikker[pl.piece];
    b.cells = pl.rel.map(c => c.slice());
    b.placed = { i: pl.anchor[0], j: pl.anchor[1] };
  }
  hintPl = null; valgt = null; visteLøsning = true; løsningTeller++;
  lydKlikk();
  tegnAlt(); lagreSpill();
  const tom = HOLES.find((h, n) => !occupancy()[n]);
  melding(`Løsning ${løsningTeller} – hullet som er tomt er i rad ${tom.j + 1}. Trykk igjen for en ny!`, 3600);
};

// ---- Seier ----
function sjekkSeier() {
  if (seierVist || visteLøsning || brikker.some(b => !b.placed)) return;
  seierVist = true;
  lagret.løst = (lagret.løst || 0) + (nivå.fast ? 1 : 0);
  lagre();
  tegnStatus();
  const tomt = HOLES.filter((h, n) => !occupancy()[n])[0];
  $('#seierTekst').textContent = nivå.fast
    ? `Alle ti brikkene ligger på plass. Du har løst ${lagret.løst} oppgave${lagret.løst === 1 ? '' : 'r'}. Hullet som ble stående tomt er i rad ${tomt.j + 1}, hull ${Math.floor(tomt.i / 2) + 1} fra venstre.`
    : 'Alle ti brikkene ligger på plass!';
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

// ---- Knapper ----
function byggNivåer() {
  const el = $('#nivaer');
  el.innerHTML = '';
  for (const n of NIVAER) {
    const k = document.createElement('button');
    k.textContent = n.navn; k.dataset.id = n.id; k.setAttribute('role', 'tab');
    k.onclick = () => { if (n.id === nivå.id) return; nivå = n; startOppgave(nr(), null); };
    el.appendChild(k);
  }
}

$('#ny').onclick = () => {
  if (nivå.fast) { lagret.nr = lagret.nr || {}; lagret.nr[nivå.id] = nummer + 1; startOppgave(nummer + 1, null); }
  else { startOppgave(1, null); }
};
$('#nullstill').onclick = () => {
  brikker = JSON.parse(startBrikker); valgt = null; hintPl = null; seierVist = false; visteLøsning = false;
  tegnAlt(); lagreSpill();
};
$('#nesteOppgave').onclick = () => { $('#seier').hidden = true; $('#ny').onclick(); };
$('#lukkSeier').onclick = () => { $('#seier').hidden = true; };
$('#hjelp').onclick = () => { $('#regler').hidden = false; };
$('#lukkRegler').onclick = () => { $('#regler').hidden = true; lagret.sett = true; lagre(); };
$('#lyd').onclick = () => { lyd = !lyd; $('#lyd').textContent = lyd ? '🔊' : '🔇'; lagreSpill(); if (lyd) lydKlikk(); };

let resizeTid = 0;
new ResizeObserver(() => { clearTimeout(resizeTid); resizeTid = setTimeout(() => { if (!drag) tegnTray(); }, 80); }).observe(trayEl);

// ---- Start ----
byggBrett();
byggNivåer();
$('#lyd').textContent = lyd ? '🔊' : '🔇';
startOppgave(nr(), lagret.brikker).then(() => { if (!lagret.sett) $('#regler').hidden = false; });

// ---- Service worker: hent ny versjon og last siden på nytt når den tar over ----
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadde = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadde && !drag) location.reload(); });
}
