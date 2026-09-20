/* Brett, brikker og løser. Ren logikk uten DOM, så den kan testes i Node.
 *
 * Brettet er et gitter av 39 åttekanthull. Koordinat (i, j): i = 0..12 (halvsteg sideveis),
 * j = 0..5 (rad). Et hull finnes bare der i + j er partall, så rad 0 har 7 hull, rad 1 har 6 osv.
 * Naboer i brikkene: (±2, 0) og (0, ±2) er koblet med stav, (±1, ±1) står inntil hverandre.
 *
 * Brikkene er målt fra bildet av det ferdige brettet (IMG_0438) med bildetolker; 10 brikker,
 * 38 kuler i alt, så ett hull står alltid tomt (i bildet: midt i den oransje ringen).
 */
const Solver = (function () {
  const COLS = 13, ROWS = 6;

  const HOLES = [];                 // [{i, j}] i rekkefølgen rad for rad
  const INDEX = {};                 // "i,j" -> hullnummer
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      if ((i + j) % 2 === 0) { INDEX[i + ',' + j] = HOLES.length; HOLES.push({ i, j }); }
    }
  }

  /* Krysningsregelen: en stav mellom (i,j) og (i+2,j) (eller (i,j+2)) går gjennom rutehullet midt mellom,
   * (i+1,j). Det rutehullet finnes bare ett av, så to staver kan aldri dele det – da ville brikkene krysset
   * hverandre. Hver plassering "opptar" derfor både kulehull og rutehull. Nummer 0..38 er kulehull,
   * 39.. er rutehull. */
  const GAPS = [];
  const GAP_INDEX = {};
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      if ((i + j) % 2 === 1) { GAP_INDEX[i + ',' + j] = HOLES.length + GAPS.length; GAPS.push({ i, j }); }
    }
  }
  const TOTAL = HOLES.length + GAPS.length;

  // Alt en brikke opptar når ankeret ligger i (ai, aj): kulehull + rutehull for stavene.
  // cells = relative celler, bars = par av cellenummer som er koblet med stav. null hvis en kule faller utenfor.
  function footprint(cells, bars, ai, aj) {
    const out = [];
    for (const [di, dj] of cells) {
      const n = INDEX[(ai + di) + ',' + (aj + dj)];
      if (n === undefined) return null;
      out.push(n);
    }
    for (const [a, b] of bars) {
      const gi = ai + (cells[a][0] + cells[b][0]) / 2, gj = aj + (cells[a][1] + cells[b][1]) / 2;
      out.push(GAP_INDEX[gi + ',' + gj]);
    }
    return out;
  }

  // Opptatt-kart (kulehull og rutehull) for en liste av {cells, anchor:[i,j]}; null hvis noe overlapper eller krysser
  function occupancyOf(list) {
    const occ = new Uint8Array(TOTAL);
    for (const p of list) {
      const fp = footprint(p.cells, p.bars, p.anchor[0], p.anchor[1]);
      if (!fp) return null;
      for (const n of fp) { if (occ[n]) return null; occ[n] = 1; }
    }
    return occ;
  }

  // Farge og cellene slik de ligger i det ferdige brettet. Begge brikkene i samme farge er ulike.
  const PIECES = [
    { id: 0, color: 'red',    cells: [[0, 0], [2, 0], [0, 2], [0, 4]], bars: [[0, 1], [0, 2], [2, 3]] },
    { id: 1, color: 'navy',   cells: [[4, 0], [6, 0], [4, 2], [2, 2]], bars: [[0, 1], [0, 2], [2, 3]] },
    { id: 2, color: 'red',    cells: [[5, 1], [6, 2], [7, 1], [8, 0]], bars: [] },
    { id: 3, color: 'navy',   cells: [[9, 1], [10, 0], [11, 1], [12, 0]], bars: [] },
    { id: 4, color: 'sky',    cells: [[1, 1], [3, 1], [1, 3]], bars: [[0, 1], [0, 2]] },
    { id: 5, color: 'sky',    cells: [[8, 2], [7, 3], [8, 4]], bars: [] },
    { id: 6, color: 'orange', cells: [[10, 2], [12, 2], [10, 4], [12, 4]], bars: [[0, 1], [0, 2], [1, 3], [2, 3]] },
    { id: 7, color: 'green',  cells: [[3, 3], [2, 4], [1, 5], [3, 5]], bars: [] },
    { id: 8, color: 'orange', cells: [[5, 3], [4, 4], [6, 4], [5, 5]], bars: [] },
    { id: 9, color: 'green',  cells: [[7, 5], [9, 5], [11, 5], [9, 3]], bars: [[0, 1], [1, 2], [1, 3]] },
  ];
  // Alle cellene relativt til første celle (ankeret).
  PIECES.forEach(p => {
    const [a, b] = p.cells[0];
    p.rel = p.cells.map(([i, j]) => [i - a, j - b]);
  });

  const rotate = cells => cells.map(([i, j]) => [-j, i]);
  const mirror = cells => cells.map(([i, j]) => [-i, j]);

  function key(cells, bars) {
    const mi = Math.min(...cells.map(c => c[0])), mj = Math.min(...cells.map(c => c[1]));
    const p = c => (c[0] - mi) + ':' + (c[1] - mj);
    const staver = (bars || []).map(([a, b]) => [p(cells[a]), p(cells[b])].sort().join('>')).sort().join(',');
    return cells.map(p).sort().join('|') + '#' + staver;
  }

  // Alle ulike orienteringer (dreiing og speiling) av en brikke, som relative celler.
  function orientations(rel, bars) {
    const seen = new Set(), out = [];
    let cur = rel;
    for (let f = 0; f < 2; f++) {
      for (let r = 0; r < 4; r++) {
        const k = key(cur, bars);
        if (!seen.has(k)) { seen.add(k); out.push(cur); }
        cur = rotate(cur);
      }
      cur = mirror(rel);
    }
    return out;
  }

  // Plasseringer: for hver brikke, hver orientering og hvert anker der alt ligger på brettet.
  // byMin[p][c] = plasseringer der laveste hullnummer er c (så løseren dekker laveste tomme hull først).
  const PLACEMENTS = [];
  const BY_MIN = [];
  const BY_CELL = [];
  PIECES.forEach(p => {
    const list = [], byMin = HOLES.map(() => []), byCell = HOLES.map(() => []);
    orientations(p.rel, p.bars).forEach(rel => {
      HOLES.forEach(h => {
        const fp = footprint(rel, p.bars, h.i, h.j);
        if (!fp) return;
        const idx = fp.slice(0, rel.length);              // bare kulehullene
        const pl = { piece: p.id, anchor: [h.i, h.j], rel, bars: p.bars, cells: idx, occ: fp };
        list.push(pl);
        byMin[Math.min(...idx)].push(pl);
        idx.forEach(n => byCell[n].push(pl));
      });
    });
    PLACEMENTS.push(list);
    BY_MIN.push(byMin);
    BY_CELL.push(byCell);
  });

  // Hvilke hull henger sammen i en brikke: diagonalt inntil, eller to hull unna med stav
  const NEIGH = HOLES.map(h => [[1, 1], [1, -1], [-1, 1], [-1, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]
    .map(([di, dj]) => INDEX[(h.i + di) + ',' + (h.j + dj)]).filter(n => n !== undefined));

  // Beskjæring: hver sammenhengende rest av frie hull må kunne fylles av brikker à 3 og 4 kuler.
  // Rester på 1, 2 eller 5 hull går bare opp hvis det ene tomme hullet brukes der (2 går aldri).
  function restOk(o, skipped) {
    const sett = new Uint8Array(HOLES.length);
    let trenger = 0;
    for (let c = 0; c < HOLES.length; c++) {
      if (o[c] || sett[c]) continue;
      let n = 0; const st = [c]; sett[c] = 1;
      while (st.length) {
        const x = st.pop(); n++;
        for (const y of NEIGH[x]) if (!o[y] && !sett[y]) { sett[y] = 1; st.push(y); }
      }
      if (n === 2) return false;
      if (n === 1 || n === 5) trenger++;
    }
    return trenger <= (skipped ? 0 : 1);
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rnd) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /* Løs videre fra en delvis fylt tilstand.
   *   occ:   Uint8Array(39), 1 = opptatt
   *   avail: brikke-id-er som ennå ikke er lagt
   *   opts:  { rnd, limit }  rnd gir tilfeldig rekkefølge, limit = maks antall løsninger som telles
   * Returnerer { count, first } der first er listen av plasseringer i første løsning.
   * Nøyaktig ett hull blir stående tomt (39 hull, 38 kuler).
   */
  function solve(occ, avail, opts) {
    opts = opts || {};
    const rnd = opts.rnd, limit = opts.limit || 1;
    const o = new Uint8Array(TOTAL); o.set(occ.subarray(0, Math.min(occ.length, TOTAL)));
    const rem = avail.slice();
    let count = 0, first = null, skipped = false, steps = 0;
    const stack = [];
    const maxSteps = opts.maxSteps || 4e6;

    // hvor mange hull er allerede tomme og "brukt opp" som det ene tomme hullet?
    let free = 0; for (let c = 0; c < HOLES.length; c++) if (!o[c]) free++;
    let need = 0; rem.forEach(p => { need += PIECES[p].cells.length; });
    if (free - need < 0 || free - need > 1) return { count: 0, first: null };
    if (free - need === 0) skipped = true;   // ingen ekstra hull igjen å hoppe over

    function go() {
      if (++steps > maxSteps) return true;      // gi opp
      if (rem.length === 0) {
        count++;
        if (!first) first = stack.slice();
        if (opts.onSolution) opts.onSolution(stack);
        return count >= limit;
      }
      if (!restOk(o, skipped)) return false;
      // velg det frie hullet med færrest mulige plasseringer (mest låst først)
      let bestC = -1, bestOpts = null, tomme = 0;
      for (let c = 0; c < HOLES.length; c++) {
        if (o[c]) continue;
        const opts = [];
        for (const p of rem) {
          for (const pl of BY_CELL[p][c]) {
            let ok = true;
            for (const n of pl.occ) if (o[n]) { ok = false; break; }
            if (ok) opts.push(pl);
          }
        }
        if (!opts.length) {
          // dette hullet kan ikke dekkes av noen brikke: må bli det ene tomme hullet
          if (skipped || ++tomme > 1) return false;
          bestC = c; bestOpts = opts; continue;
        }
        if (bestOpts === null || (bestOpts.length > 0 && opts.length < bestOpts.length)) { bestC = c; bestOpts = opts; }
        if (opts.length === 1 && bestOpts.length === 1) { /* kan ikke bli bedre */ }
      }
      if (bestC < 0) return false;
      const c = bestC;
      const list = rnd ? shuffle(bestOpts.slice(), rnd) : bestOpts;
      for (const pl of list) {
        for (const n of pl.occ) o[n] = 1;
        rem.splice(rem.indexOf(pl.piece), 1);
        stack.push(pl);
        const stop = go();
        stack.pop();
        rem.push(pl.piece);
        for (const n of pl.occ) o[n] = 0;
        if (stop) return true;
      }
      if (!skipped) {
        skipped = true; o[c] = 1;
        const stop = go();
        o[c] = 0; skipped = false;
        if (stop) return true;
      }
      return false;
    }
    go();
    return { count, first, gaveUp: steps > maxSteps };
  }

  // Tilfeldig løsning med omstart: korte forsøk først, siden søket av og til går seg fast på en dårlig start
  function solveRandom(occ, avail, rnd) {
    for (let t = 0; t < 40; t++) {
      const r = solve(occ, avail, { rnd, limit: 1, maxSteps: 300 });
      if (r.first) return r;
    }
    return solve(occ, avail, { rnd, limit: 1 });
  }

  /* Lag en oppgave: finn en tilfeldig full løsning, og la et antall brikker stå igjen som start.
   * Samme (nivå, nummer) gir alltid samme oppgave. */
  function makePuzzle(fixedCount, seed) {
    const rnd = mulberry32(seed);
    const all = PIECES.map(p => p.id);
    const empty = new Uint8Array(TOTAL);
    const full = solveRandom(empty, all, rnd).first;
    if (fixedCount <= 0) return { fixed: [], solution: full };
    // velg brikker som gir få løsninger (prøv noen utvalg, behold det mest låste)
    let best = null, bestCount = Infinity;
    for (let t = 0; t < 12; t++) {
      const pick = shuffle(full.slice(), rnd).slice(0, fixedCount);
      const occ = new Uint8Array(TOTAL);
      pick.forEach(pl => pl.occ.forEach(n => { occ[n] = 1; }));
      const left = all.filter(p => !pick.some(pl => pl.piece === p));
      const r = solve(occ, left, { limit: 400, maxSteps: 3e5 });
      const n = r.count || 1e9;
      if (n < bestCount) { bestCount = n; best = pick; }
      if (n <= (fixedCount <= 2 ? 25 : 3)) break;
    }
    return { fixed: best, solution: full, solutions: bestCount };
  }

  return { solveRandom, COLS, ROWS, HOLES, INDEX, GAPS, GAP_INDEX, TOTAL, footprint, occupancyOf, PIECES, PLACEMENTS, solve, makePuzzle, mulberry32,
           rotate, mirror, orientations, key };
})();

if (typeof module !== 'undefined') module.exports = Solver;
