import { HandwritingProfile, Paper, StrokeElement, paperBaselineStep } from "./document";

export interface NormalizationResult {
  strokes: StrokeElement[];
  profile: HandwritingProfile;
  changed: boolean;
  baseline: number;
}

/**
 * Only translate a complete word onto a nearby rule. Geometry alone cannot
 * infer a letter: never rescale separate strokes, shear a word, or round loops.
 * Semantic reconstruction belongs to the explicit HTR review.
 */
export function normalizeHandwritingWord(
  source: StrokeElement[],
  profile: HandwritingProfile,
  paper: Paper,
  baselineAnchors: number[] = []
): NormalizationResult {
  const points = source.flatMap(stroke => stroke.points);
  if (!points.length || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
    return { strokes: source, profile, changed: false, baseline: 0 };
  }
  let top = Infinity; let bottom = -Infinity;
  for (const p of points) { top = Math.min(top, p.y); bottom = Math.max(bottom, p.y); }
  const step = paperBaselineStep(paper);
  const targets = [...baselineAnchors.filter(Number.isFinite)];
  if (step > 0) targets.push(Math.round(bottom / step) * step);
  const target = targets.sort((a, b) => Math.abs(a - bottom) - Math.abs(b - bottom))[0];
  // At most two page pixels, applied identically to every point of every stroke.
  const dy = target !== undefined && Math.abs(target - bottom) <= 2 ? target - bottom : 0;
  const strokes = dy === 0 ? source : source.map(stroke => ({
    ...stroke,
    rawPoints: stroke.rawPoints ?? structuredClone(stroke.points),
    points: stroke.points.map(p => ({ ...p, y: p.y + dy }))
  }));
  return {
    strokes, changed: dy !== 0, baseline: bottom + dy,
    profile: { ...profile, targetHeight: Math.max(1, bottom - top), samples: profile.samples + 1 }
  };
}
