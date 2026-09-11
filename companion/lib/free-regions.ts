/*
 * Freie-Regionen-Suche für die notebook_inspect-Antwort.
 * Deterministisches Raster-Scan über Blendstücken; liefert grobe freie
 * Rechtecke (absteigend nach Fläche). Kein metrisches Versprechen — es soll
 * dem Agenten zeigen, WO Platz ist, nicht millimetergenaues Docken.
 */

export interface RegionBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface FreeRegionOptions {
  cell?: number;
  minWidth?: number;
  minHeight?: number;
  maxRegions?: number;
}

export function findFreeRegions(
  pageWidth: number,
  pageHeight: number,
  occupied: RegionBounds[],
  options: FreeRegionOptions = {}
): RegionBounds[] {
  const cell = options.cell ?? 64;
  const minWidth = options.minWidth ?? cell;
  const minHeight = options.minHeight ?? cell;
  const maxRegions = options.maxRegions ?? 12;
  const columns = Math.max(1, Math.ceil(pageWidth / cell));
  const rows = Math.max(1, Math.ceil(pageHeight / cell));

  // Zellen als blockiert markieren, wenn der Raum mit belegten Bounds überlappt.
  const blocked = new Uint8Array(columns * rows);
  for (const bounds of occupied) {
    if (!bounds || ![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite)) continue;
    const startCol = Math.max(0, Math.floor(bounds.minX / cell));
    const endCol = Math.min(columns - 1, Math.floor((bounds.maxX - 1) / cell));
    const startRow = Math.max(0, Math.floor(bounds.minY / cell));
    const endRow = Math.min(rows - 1, Math.floor((bounds.maxY - 1) / cell));
    for (let row = startRow; row <= endRow; row += 1) {
      for (let col = startCol; col <= endCol; col += 1) blocked[row * columns + col] = 1;
    }
  }

  // Zeilenweise zusammenhängende freie Läufe (Runs) sammeln.
  const rowRuns: { c0: number; c1: number }[][] = [];
  for (let row = 0; row < rows; row += 1) {
    const runs: { c0: number; c1: number }[] = [];
    let col = 0;
    while (col < columns) {
      if (blocked[row * columns + col]) { col += 1; continue; }
      const c0 = col;
      while (col + 1 < columns && !blocked[row * columns + (col + 1)]) col += 1;
      runs.push({ c0, c1: col });
      col += 1;
    }
    rowRuns.push(runs);
  }

  // Jeden Run nach unten verlängern, solange jede Folgezeile ihn abdeckt.
  const regions: RegionBounds[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (const run of rowRuns[row]) {
      let endRow = row;
      for (let below = row + 1; below < rows; below += 1) {
        const covers = (rowRuns[below] ?? []).some((candidate) => candidate.c0 <= run.c0 && candidate.c1 >= run.c1);
        if (!covers) break;
        endRow = below;
      }
      const region: RegionBounds = {
        minX: run.c0 * cell,
        minY: row * cell,
        maxX: Math.min((run.c1 + 1) * cell, pageWidth),
        maxY: Math.min((endRow + 1) * cell, pageHeight),
      };
      if (region.maxX - region.minX >= minWidth && region.maxY - region.minY >= minHeight) regions.push(region);
    }
  }

  regions.sort((left, right) => ((right.maxX - right.minX) * (right.maxY - right.minY)) - ((left.maxX - left.minX) * (left.maxY - left.minY)));
  return mergeAndLimit(regions, maxRegions);
}

/** Vertikal angrenzende Bänder gleicher Breite zu einem Rechteck verschmelzen. */
function mergeAndLimit(regions: RegionBounds[], maxRegions: number): RegionBounds[] {
  const ordered = [...regions].sort((left, right) => left.minX - right.minX || left.minY - right.minY || left.maxX - right.maxX);
  const merged: RegionBounds[] = [];
  for (const region of ordered) {
    const previous = merged[merged.length - 1];
    if (previous && previous.minX === region.minX && previous.maxX === region.maxX && previous.maxY === region.minY) {
      previous.maxY = region.maxY;
    } else {
      merged.push({ ...region });
    }
  }
  merged.sort((left, right) => ((right.maxX - right.minX) * (right.maxY - right.minY)) - ((left.maxX - left.minX) * (left.maxY - left.minY)));
  const unique = new Map<string, RegionBounds>();
  for (const region of merged) {
    const key = `${region.minX},${region.minY},${region.maxX},${region.maxY}`;
    if (!unique.has(key)) unique.set(key, region);
  }
  // In größeren Regionen vollständig enthaltene Rechtecke verwerfen (größte zuerst).
  const kept: RegionBounds[] = [];
  for (const region of unique.values()) {
    const area = (region.maxX - region.minX) * (region.maxY - region.minY);
    const contained = kept.some((candidate) => {
      const candidateArea = (candidate.maxX - candidate.minX) * (candidate.maxY - candidate.minY);
      return candidateArea >= area && candidate.minX <= region.minX && candidate.minY <= region.minY
        && candidate.maxX >= region.maxX && candidate.maxY >= region.maxY;
    });
    if (!contained) kept.push(region);
  }
  return kept.slice(0, maxRegions);
}