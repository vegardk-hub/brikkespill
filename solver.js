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

  // Farge og cellene slik de ligger i det ferdige brettet. Begge brikkene i samme farge er ulike.
  const PIECES = [
    { id: 0, color: 'red',    cells: [[0, 0], [2, 0], [0, 2], [0, 4]] },
    { id: 1, color: 'navy',   cells: [[4, 0], [6, 0], [4, 2], [2, 2]] },
    { id: 2, color: 'red',    cells: [[5, 1], [6, 2], [7, 1], [8, 0]] },
    { id: 3, color: 'navy',   cells: [[9, 1], [10, 0], [11, 1], [12, 0]] },
    { id: 4, color: 'sky',    cells: [[1, 1], [3, 1], [1, 3]] },
    { id: 5, color: 'sky',    cells: [[8, 2], [7, 3], [8, 4]] },
    { id: 6, color: 'orange', cells: [[10, 2], [12, 2], [10, 4], [12, 4]] },
    { id: 7, color: 'green',  cells: [[3, 3], [2, 4], [1, 5], [3, 5]] },
    { id: 8, color: 'orange', cells: [[5, 3], [4, 4], [6, 4], [5, 5]] },
    { id: 9, color: 'green',  cells: [[7, 5], [9, 5], [11, 5], [9, 3]] },
  ];
  // Alle cellene relativt til første celle (ankeret).
  PIECES.forEach(p => {
    const [a, b] = p.cells[0];
    p.rel = p.cells.map(([i, j]) => [i - a, j - b]);
  });

  const rotate = cells => cells.map(([i, j]) => [-j, i]);
  const mirror = cells => cells.map(([i, j]) => [-i, j]);

  function key(cells) {
    const mi = Math.min(...cells.map(c => c[0])), mj = Math.min(...cells.map(c => c[1]));
    return cells.map(c => (c[0] - mi) + ':' + (c[1] - mj)).sort().join('|');
  }

  // Alle ulike orienteringer (dreiing og speiling) av en brikke, som relative celler.
  function orientations(rel) {
    const seen = new Set(), out = [];
    let cur = rel;
    for (let f = 0; f < 2; f++) {
      for (let r = 0; r < 4; r++) {
        const k = key(cur);
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
  PIECES.forEach(p => {
    const list = [], byMin = HOLES.map(() => []);
    orientations(p.rel).forEach(rel => {
      HOLES.forEach(h => {
        const idx = [];
        for (const [di, dj] of rel) {
          const n = INDEX[(h.i + di) + ',' + (h.j + dj)];
          if (n === undefined) return;
          idx.push(n);
        }
        const pl = { piece: p.id, anchor: [h.i, h.j], rel, cells: idx };
        list.push(pl);
        byMin[Math.min(...idx)].push(pl);
      });
    });
    PLACEMENTS.push(list);
    BY_MIN.push(byMin);
  });

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
    const o = Uint8Array.from(occ);
    const rem = avail.slice();
    let count = 0, first = null, skipped = false, steps = 0;
    const stack = [];
    const maxSteps = opts.maxSteps || 4e6;

    // hvor mange hull er allerede tomme og "brukt opp" som det ene tomme hullet?
    let free = 0; for (let c = 0; c < o.length; c++) if (!o[c]) free++;
    let need = 0; rem.forEach(p => { need += PIECES[p].cells.length; });
    if (free - need < 0 || free - need > 1) return { count: 0, first: null };
    if (free - need === 0) skipped = true;   // ingen ekstra hull igjen å hoppe over

    function go() {
      if (++steps > maxSteps) return true;      // gi opp
      if (rem.length === 0) {
        count++;
        if (!first) first = stack.slice();
        return count >= limit;
      }
      let c = 0;
      while (c < o.length && o[c]) c++;
      if (c >= o.length) return false;
      const order = rem.slice();
      if (rnd) shuffle(order, rnd);
      for (const p of order) {
        const pls = BY_MIN[p][c];
        const list = rnd ? shuffle(pls.slice(), rnd) : pls;
        for (const pl of list) {
          let ok = true;
          for (const n of pl.cells) if (o[n]) { ok = false; break; }
          if (!ok) continue;
          for (const n of pl.cells) o[n] = 1;
          rem.splice(rem.indexOf(p), 1);
          stack.push(pl);
          const stop = go();
          stack.pop();
          rem.push(p);
          for (const n of pl.cells) o[n] = 0;
          if (stop) return true;
        }
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

  /* Lag en oppgave: finn en tilfeldig full løsning, og la et antall brikker stå igjen som start.
   * Samme (nivå, nummer) gir alltid samme oppgave. */
  function makePuzzle(fixedCount, seed) {
    const rnd = mulberry32(seed);
    const all = PIECES.map(p => p.id);
    const empty = new Uint8Array(HOLES.length);
    const full = solve(empty, all, { rnd }).first;
    if (fixedCount <= 0) return { fixed: [], solution: full };
    // velg brikker som gir få løsninger (prøv noen utvalg, behold det mest låste)
    let best = null, bestCount = Infinity;
    for (let t = 0; t < 12; t++) {
      const pick = shuffle(full.slice(), rnd).slice(0, fixedCount);
      const occ = new Uint8Array(HOLES.length);
      pick.forEach(pl => pl.cells.forEach(n => { occ[n] = 1; }));
      const left = all.filter(p => !pick.some(pl => pl.piece === p));
      const r = solve(occ, left, { limit: 400, maxSteps: 3e5 });
      const n = r.count || 1e9;
      if (n < bestCount) { bestCount = n; best = pick; }
      if (n <= (fixedCount <= 2 ? 25 : 3)) break;
    }
    return { fixed: best, solution: full, solutions: bestCount };
  }

  return { COLS, ROWS, HOLES, INDEX, PIECES, PLACEMENTS, solve, makePuzzle, mulberry32,
           rotate, mirror, orientations, key };
})();

if (typeof module !== 'undefined') module.exports = Solver;
