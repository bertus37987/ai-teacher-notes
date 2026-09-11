import {Paper,paperBaselineStep,StrokeElement,elementBounds} from "./document";
export interface PaperWritingSettings {beautifyPaperSize:boolean;beautifySize:number;gridWritingHeight:number;lineWritingHeight:number}
export const PAPER_WRITING_DEFAULTS:PaperWritingSettings={beautifyPaperSize:true,beautifySize:36,gridWritingHeight:2,lineWritingHeight:1};
export function paperWritingLayout(paper:Paper,settings:PaperWritingSettings):{height:number} {
  const step=paperBaselineStep(paper);
  const units=paper==="grid" ? settings.gridWritingHeight : settings.lineWritingHeight;
  const height=settings.beautifyPaperSize && step ? step*units : settings.beautifySize;
  return {height};
}

/**
 * Zeichnungs-Schutz: Ein Strich-Cluster ist eine Zeichnung (nicht Schrift),
 * wenn er deutlich größer als die Schreibzeile ist. Zeichnungen bleiben
 * vollständig intakt — keine Höhenkorrektur, keine Entzerrung, kein Glätten.
 * Kriterium bewusst einfach und deterministisch: Gesamthöhe > 3× Zielhöhe
 * ODER Gesamtfläche > 12× Schreibzeilenfläche.
 */
export function isDrawingCluster(strokes: StrokeElement[], targetHeight: number): boolean {
  if (!strokes.length) return false;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, points = 0;
  for (const stroke of strokes) {
    const b = elementBounds(stroke);
    minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
    points += stroke.points.length;
  }
  const height = maxY - minY, width = maxX - minX;
  if (height > targetHeight * 3) return true;
  if (width > targetHeight * 30 && height > targetHeight * 1.6) return true;
  // Wenige Punkte auf großer Fläche = Skizze, nicht Schrift (Schrift ist dicht).
  if (points >= 6 && width > targetHeight * 14 && points / Math.max(1, width / targetHeight) < 8) return true;
  // Ein einziger langer, flacher Strich ist Linie/Unterstrich — zwei oder mehr
  // lange flache Striche auf großer Fläche sind eine Skizze.
  if (strokes.length >= 2 && width > targetHeight * 20 && height < targetHeight * 1.4) return true;
  return false;
}

/** Split only the newly captured line into words; never scan old page contents. */
export function splitNewInkWords(strokes:StrokeElement[]):StrokeElement[][] {
  const sorted=strokes.map(stroke=>({stroke,box:elementBounds(stroke)})).sort((a,b)=>a.box.minX-b.box.minX);
  const heights=sorted.map(s=>s.box.maxY-s.box.minY).filter(h=>h>5).sort((a,b)=>a-b);
  const threshold=Math.max(12,(heights[Math.floor(heights.length/2)] ?? 24)*.65);
  const words:StrokeElement[][]=[]; let right=-Infinity;
  for(const item of sorted) { if(!words.length || item.box.minX-right>threshold) words.push([]); words.at(-1)!.push(item.stroke); right=Math.max(right,item.box.maxX); }
  return words;
}
