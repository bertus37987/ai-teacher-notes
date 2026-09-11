import { StrokeElement, elementBounds, Paper } from "./document";
import { InkPoint } from "./strokes";

export interface HandwritingV2Options { height: number; strength: number; spacing?: number; lockRows?: boolean; pageWidth: number; pageHeight: number; paper: Paper; baseline?: number; startX?: number; rowStep?:number; closeLoops?:boolean; equalize?:boolean; smooth?:boolean; }
export interface HandwritingV2Result { strokes: StrokeElement[]; baseline: number; endX: number; }

/** Nutzervorgabe 8.9.2026: kein Plattdrücken (Min teilt durch) und kein Aufblasen. */
export const HEIGHT_RATIO_MIN = 0.75;
export const HEIGHT_RATIO_MAX = 1.35;

/** One conservative pass. Corners, extrema, pressure and timing remain the writer's. */
/** Mean sharpness (second derivative proxy): already-smooth ink must stay as it is. */
function inkRoughness(points: InkPoint[]): number {
  if(points.length<3) return 0;
  const span=Math.max(1,points.reduce((y,p)=>Math.max(y,p.y),-Infinity)-points.reduce((y,p)=>Math.min(y,p.y),Infinity));
  let sharpness=0;
  for(let i=1;i<points.length-1;i+=1) {
    const ax=points[i].x-points[i-1].x,ay=points[i].y-points[i-1].y,bx=points[i+1].x-points[i].x,by=points[i+1].y-points[i].y;
    sharpness+=Math.hypot(bx-ax,by-ay);
  }
  return sharpness/(points.length*Math.max(4,span*.25));
}

/** Simplify only to find stable corners; keep all samples, pressure and timing. */
export function smoothOwnInk(points: InkPoint[], strength: number): InkPoint[] {
  const mix=Math.max(0,Math.min(1,strength));
  if(points.length<5 || mix===0) return points.map(p=>({...p}));
  // Gentle-refinement principle: already-clean ink is left almost untouched;
  // rough, shaky strokes get the full stabilizing pass.
  const roughness=inkRoughness(points);
  if(roughness<=0.011) return points.map(p=>({...p}));
  const effectiveMix=mix*Math.min(1,roughness/0.055);
  if(effectiveMix<0.02) return points.map(p=>({...p}));
  const bounds=elementBounds({type:"stroke",id:"bounds",color:"",size:1,points});
  const span=Math.max(bounds.maxX-bounds.minX,bounds.maxY-bounds.minY);
  const tolerance=Math.max(.65,Math.min(2.5,span*.035));
  const anchors=new Set([0,points.length-1]),pending:Array<[number,number]>=[[0,points.length-1]];
  let work=0;
  while(pending.length) {
    const [first,last]=pending.pop()!,a=points[first],b=points[last];
    const dx=b.x-a.x,dy=b.y-a.y,length2=dx*dx+dy*dy;
    let farthest=-1,maxDistance=tolerance;
    for(let i=first+1;i<last;i++) {
      // Avoid pathological quadratic work on very long, tangled strokes.
      if(++work>250_000) break;
      const p=points[i],t=length2 ? Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length2)) : 0;
      const distance=Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
      if(distance>maxDistance) {maxDistance=distance;farthest=i;}
    }
    if(farthest>=0) {anchors.add(farthest);pending.push([first,farthest],[farthest,last]);}
  }
  // Weighted low-pass (stabilizer, not rewriter): two passes of a 5-tap kernel.
  // High-frequency capture jitter dies out; low-frequency letter curves (period
  // >> 5 samples) stay. Endpoints, pressure and timing are never touched.
  const weights=[1,2,3,2,1];
  let source=points.map(p=>({...p}));
  // Nutzerverbesserung 10.9.2026 (Fail „Begradigen frisst Rundungen"): der Mix
  // wird pro Punkt an den lokalen Richtungswechsel gekoppelt (Schwellen wie
  // cleanCapturedStrokeLegacy). Ruhige Geraden bekommen vollen Mix, Kurven und
  // Bögen bleiben in ihrer Geometrie — 0,8 begradigt Linien, nie Buchstaben.
  for(let pass=0;pass<2;pass+=1) {
    const next=source.map(p=>({...p}));
    for(let i=2;i<source.length-2;i+=1) {
      // Gerade-vs-Kurve über die seitliche Abweichung von der lokalen
      // Trendgeraden (Regressions-Sehne im ±4-Fenster): Erfassungs-Zittrigkeit
      // und Zacken liegen direkt AUF der Geraden (kleine Abweichung) und
      // werden voll geglättet; echte Bögen weichen dauerhaft ab und bleiben
      // in ihrer Geometrie — 0,8 begradigt Linien, nie Buchstaben.
      const w0=Math.max(1,i-4),w1=Math.min(source.length-2,i+4);
      const p0=source[w0],p1=source[w1];
      const dirX=p1.x-p0.x,dirY=p1.y-p0.y,dirLen=Math.hypot(dirX,dirY);
      let maxSide=0;
      if(dirLen>0.001) {
        for(let o=w0;o<=w1;o+=1) {
          const dx=source[o].x-p0.x,dy=source[o].y-p0.y;
          maxSide=Math.max(maxSide,Math.abs(dx*dirY-dy*dirX)/dirLen);
        }
      }
      const straight=maxSide<3.5;
      const localMix=straight ? effectiveMix : maxSide<7 ? effectiveMix*0.4 : 0;
      if(localMix<=0) continue;
      let sumX=0,sumY=0;
      for(let o=-2;o<=2;o+=1) { sumX+=source[i+o].x*weights[o+2]; sumY+=source[i+o].y*weights[o+2]; }
      next[i]={...source[i],x:source[i].x+(sumX/9-source[i].x)*localMix,y:source[i].y+(sumY/9-source[i].y)*localMix};
    }
    source=next;
  }
  // Structural anchors come from the SMOOTHED curve: real letter features
  // survive the low-pass, so their original sample positions are restored
  // exactly — while jitter peaks, which the low-pass already dissolved, are
  // not re-imported. Flip-back spikes never become anchors.
  const smoothForAnchors=source;
  const anchorSet=new Set([0,points.length-1]);
  const pending2:Array<[number,number]>=[[0,points.length-1]];
  let work2=0;
  while(pending2.length) {
    const [first,last]=pending2.pop()!,a=smoothForAnchors[first],b=smoothForAnchors[last];
    const dx=b.x-a.x,dy=b.y-a.y,length2=dx*dx+dy*dy;
    let farthest=-1,maxDistance=tolerance;
    for(let i=first+1;i<last;i++) {
      if(++work2>250_000) break;
      const p=smoothForAnchors[i],t=length2 ? Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length2)) : 0;
      const distance=Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
      if(distance>maxDistance) {maxDistance=distance;farthest=i;}
    }
    if(farthest>=0) {anchorSet.add(farthest);pending2.push([first,farthest],[farthest,last]);}
  }
  // Nutzerverbesserung 10.9.2026 (Fail „Ovale polygonal"): Originalsamples nur an
  // echten KNICKEN restaurieren (Vorzeichenwechsel zwischen kurzen Segmenten).
  // Ein Anker ohne Vorzeichenwechsel ist bloße Krümmung — dort bleibt die
  // geglättete Kurve, sonst re-importiert jeder Oval-Punkt Erfassungs-Jitter.
  for(const index of [...anchorSet]) {
    if(index===0 || index===points.length-1) continue;
    const p=points[index],a=points[index-1],b=points[index+1];
    const ax=p.x-a.x,ay=p.y-a.y,bx=b.x-p.x,by=b.y-p.y;
    const lengths=Math.hypot(ax,ay)*Math.hypot(bx,by);
    const minSegment=Math.max(6,span*.04);
    const isCorner=lengths && (ax*bx+ay*by)/lengths<0 && Math.max(Math.hypot(ax,ay),Math.hypot(bx,by))<minSegment;
    if(!isCorner) anchorSet.delete(index);
  }
  for(const index of anchorSet) source[index]={...points[index]};
  // Nutzerauftrag 10.9.2026 („Begradigen greift bei Buchstaben nicht"): Der Tiefpass
  // kann eine weiche Biegung nicht entfernen (niederfrequent — gemessen blieb ein
  // 2-px-Bogen am Buchstabenstamm zu 99 % stehen). Zwischen den Ankern liegen Läufe;
  // ein Lauf, dessen Punkte nur minimal von seiner Sehne abweichen, IST eine Gerade —
  // seine Punkte werden anteilig (Mix) orthogonal auf die Sehne gezogen. Echte Bögen
  // (c, u) weichen dauerhaft ab und bleiben unangetastet.
  const runEdges=[...anchorSet].sort((a,b)=>a-b);
  for(let edge=0;edge<runEdges.length-1;edge+=1) {
    const first=runEdges[edge],last=runEdges[edge+1];
    if(last-first<4) continue;
    const p0=source[first],p1=source[last];
    const dx=p1.x-p0.x,dy=p1.y-p0.y,chord=Math.hypot(dx,dy);
    if(chord<Math.max(10,span*.18)) continue;
    const tolerance=Math.max(4,chord*.14);
    let maxDeviation=0;
    for(let i=first+1;i<last;i+=1) {
      const p=source[i];
      maxDeviation=Math.max(maxDeviation,Math.abs((p.x-p0.x)*dy-(p.y-p0.y)*dx)/chord);
      if(maxDeviation>tolerance) break;
    }
    if(maxDeviation>tolerance) continue;
    for(let i=first+1;i<last;i+=1) {
      const p=source[i];
      const t=Math.max(0,Math.min(1,((p.x-p0.x)*dx+(p.y-p0.y)*dy)/(chord*chord)));
      source[i]={...p,x:p.x+(p0.x+t*dx-p.x)*effectiveMix,y:p.y+(p0.y+t*dy-p.y)*effectiveMix};
    }
  }
  return source;
}

/** Bridge only a tiny gap in a single near-complete oval; never replace its contour. */
export function closeOwnInkLoop(points: InkPoint[]): InkPoint[] {
  if(points.length<8) return points;
  const bounds=elementBounds({type:"stroke",id:"bounds",color:"",size:1,points});
  const rx=(bounds.maxX-bounds.minX)/2,ry=(bounds.maxY-bounds.minY)/2;
  if(Math.min(rx,ry)<2.5 || Math.max(rx,ry)/Math.min(rx,ry)>3.5) return points;
  const first=points[0],last=points.at(-1)!;
  const gap=Math.hypot(first.x-last.x,first.y-last.y);
  if(gap<.01 || gap>Math.hypot(bounds.maxX-bounds.minX,bounds.maxY-bounds.minY)*1.1) return points;
  // Nutzerauftrag 10.9.2026 („Ovale werden nicht geschlossen“): Die alte Schwelle
  // ≥ 1,84π verlangte einen fast vollständigen Kreis — ein normal geschriebenes „o“
  // hat 15–35 % Lücke und wurde deshalb nie geschlossen. Jetzt entscheidet die
  // Kombination aus Umlauf, Rücklauf-Richtung und Jitter-Anteil: geschlossen wird,
  // wenn der Stift überwiegend im Kreis lief (≥ 1,25π) und am Ende wieder AUF den
  // Startpunkt zuläuft (Richtungs-Kosinus). Offene Bögen (c, u) scheitern an beiden.
  const cx=bounds.minX+rx,cy=bounds.minY+ry;
  let sweep=0,travel=0;
  for(let i=1;i<points.length;i++) {
    const p=points[i],before=points[i-1];
    const radius=Math.hypot((p.x-cx)/rx,(p.y-cy)/ry);
    if(radius<.6 || radius>1.4) return points;
    let delta=Math.atan2((p.y-cy)/ry,(p.x-cx)/rx)-Math.atan2((before.y-cy)/ry,(before.x-cx)/rx);
    if(delta>Math.PI) delta-=Math.PI*2;
    if(delta< -Math.PI) delta+=Math.PI*2;
    sweep+=delta;travel+=Math.abs(delta);
  }
  if(Math.abs(sweep)<Math.PI*1.25 || Math.abs(sweep)>Math.PI*2.15 || travel>Math.abs(sweep)*1.25) return points;
  // Richtung am Ende gegen die Richtung zum Startpunkt. Theoretisch trennt das
  // sauber: für einen Kreisbogen mit Winkel θ ist der Kosinus exakt −sin θ — also
  // deutlich negativ für offene Bögen (c ≈ −0,71, u ≈ −1) und ≈ +0,9 für Ovale.
  // Gemessen wird über die letzten zwei Segmente (kurze Sehne), weil eine längere
  // Sehne gegenüber der Tangente nach innen gedreht ist und den Wert künstlich senkt.
  const toStart={x:(first.x-last.x)/gap,y:(first.y-last.y)/gap};
  const tail=points[Math.max(0,points.length-3)];
  const tailLen=Math.hypot(last.x-tail.x,last.y-tail.y)||1;
  if(((last.x-tail.x)/tailLen)*toStart.x+((last.y-tail.y)/tailLen)*toStart.y<0.25) return points;
  // Nutzerverbesserung 10.9.2026: Lücke nicht mit einem geraden Chord zukleistern,
  // sondern mit 5 Punkten auf dem Ellipsenbogen zwischen End- und Startpunkt —
  // das Oval bleibt rund statt „abgeschnitten“.
  const angleLast=Math.atan2((last.y-cy)/ry,(last.x-cx)/rx),angleFirst=Math.atan2((first.y-cy)/ry,(first.x-cx)/rx);
  let delta=angleFirst-angleLast;
  if(delta>Math.PI) delta-=Math.PI*2;
  if(delta<-Math.PI) delta+=Math.PI*2;
  // Die Richtung muss dem Umlauf folgen (nicht gegen ihn) — sonst entsteht eine Schleife.
  if(delta*sweep<0) delta+= (delta>0 ? -1 : 1)*Math.PI*2;
  const bridge:InkPoint[]=[];
  for(let step=1;step<5;step+=1) {
    const angle=angleLast+delta*(step/5);
    bridge.push({...last,x:cx+Math.cos(angle)*rx,y:cy+Math.sin(angle)*ry});
  }
  bridge.push({...last,x:first.x,y:first.y}); // exakter Abschluss am Startpunkt
  return [...points,...bridge];
}

/** Sanftes Applien (Phase 3): gewichtete lokale Glättung, Ecken und Extrema bleiben. */
export function smoothInkLines(points: InkPoint[]): InkPoint[] {
  if (points.length < 5) return points;
  const box = elementBounds({ type: "stroke", id: "bounds", color: "", size: 1, points });
  const weights = [1, 2, 3, 2, 1];
  return points.map((point, index) => {
    if (index < 2 || index >= points.length - 2) return { ...point };
    const before = points[index - 1];
    const after = points[index + 1];
    const ax = point.x - before.x, ay = point.y - before.y;
    const bx = after.x - point.x, by = after.y - point.y;
    const lengths = Math.hypot(ax, ay) * Math.hypot(bx, by);
    if (!lengths || (ax * bx + ay * by) / lengths < 0.85) return { ...point };
    let sumX = 0, sumY = 0, sumWeight = 0;
    for (let offset = -2; offset <= 2; offset += 1) {
      const weight = weights[offset + 2];
      sumX += points[index + offset].x * weight;
      sumY += points[index + offset].y * weight;
      sumWeight += weight;
    }
    // Keep each captured extreme on its own axis; averaging the remaining
    // coordinates is convex, so it cannot expand the envelope either.
    return { ...point,
      x: point.x === box.minX || point.x === box.maxX ? point.x : sumX / sumWeight,
      y: point.y === box.minY || point.y === box.maxY ? point.y : sumY / sumWeight
    };
  });
}

/**
 * Buchstaben entzerren (Phase 3): Cluster innerhalb des Worts werden über
 * x-Lücken getrennt; ihre Höhen laufen behutsam auf den Cluster-Median zu
 * (max. ±12 %). Die Wort-Unterkante bleibt, x-Positionen bleiben unverändert —
 * kein Umplatzieren, keine Abstandskorrektur.
 */
const inkHeightOf=(points:InkPoint[]):number=>{
  let min=Infinity,max=-Infinity;
  for(const point of points){ if(point.y<min) min=point.y; if(point.y>max) max=point.y; }
  return max-min;
};

/** Punkte nach x sortieren und an x-Lücken in Cluster (Buchstaben) schneiden. */
function clusterPointsByX(points:InkPoint[],gapRatio:number):InkPoint[][] {
  if(!points.length) return [];
  const sorted=[...points].sort((left,right)=>left.x-right.x);
  const span=Math.max(1,sorted[sorted.length-1].x-sorted[0].x);
  const gapThreshold=span*gapRatio;
  const clusters:InkPoint[][]=[];
  let current:InkPoint[]=[sorted[0]];
  for(let index=1;index<sorted.length;index+=1){
    if(sorted[index].x-sorted[index-1].x>gapThreshold){clusters.push(current);current=[];}
    current.push(sorted[index]);
  }
  clusters.push(current);
  return clusters;
}

/**
 * Kleinere Mode einer Höhenliste: einheitliche Höhen (reines Körperwort) liefern
 * den Median, gemischte Höhen (Körper + Ober-/Unterlängen) die kürzere Gruppe.
 */
function lowerModeOf(values:number[]):number {
  const ordered=[...values].sort((left,right)=>left-right);
  const median=ordered[Math.floor(ordered.length/2)];
  if(!(median>0)) return 0;
  // Zwei Klassen trennen (Körperbuchstaben | Ober-/Unterlängen): die größte
  // Lücke der sortierten Höhenliste, sofern sie deutlich genug ist. Ohne
  // deutliche Lücke ist das Wort einförmig ⇒ Median (Körperhöhe = Worthöhe).
  let splitIndex=-1,bestGap=0;
  for(let index=1;index<ordered.length;index+=1){
    const gap=ordered[index]-ordered[index-1];
    if(gap>bestGap){bestGap=gap;splitIndex=index;}
  }
  if(splitIndex<=0 || bestGap<=median*0.35) return median;
  const lower=ordered.slice(0,splitIndex);
  return lower[Math.floor(lower.length/2)] ?? median;
}

/**
 * Körperhöhe (x-Höhe) eines Wortes schätzen — Nutzerauftrag 10.9.2026
 * ("detailierte Probe und Reperatur der Handschrift").
 *
 * Probe-Befund mit den Live-Einstellungen (Ziel 66 px): die Zielhöhe wurde über
 * die volle Worthöhe gerechnet. Dadurch wurde derselbe Buchstabe im Wort mit
 * Aufsteigern 35,4 px klein, im reinen Körperwort dagegen 49,9 px — die Schrift
 * wirkte ungleichmäßig. Schätzung = untere Klasse der Strich-Höhen (größte
 * Lücke), begrenzt auf [0.35, 1] × Worthöhe. Einförmige Wörter (nur
 * Körperhöhe, Kursive in einem Strich, Formen) liefern die Worthöhe selbst —
 * dort bleibt die Korrektur genau wie vorher.
 */
export function estimateBodyHeight(strokes:InkPoint[][],wordHeight:number):number {
  const floor=Math.max(5,wordHeight*0.35);
  const heights:number[]=[];
  for(const points of strokes){
    const height=inkHeightOf(points);
    if(height<floor) continue;
    // Querbalken (H-Balken, t-Strich, Bindestrich) sind kein Buchstabenkörper:
    // sie sind viel breiter als hoch und würden die Schätzung nach unten ziehen.
    const xs=points.map(point=>point.x);
    const width=Math.max(...xs)-Math.min(...xs);
    if(width>height*1.6) continue;
    heights.push(height);
  }
  const body=heights.length ? lowerModeOf(heights) : wordHeight;
  return Math.min(Math.max(body,floor),wordHeight);
}

export function equalizeWordInk(strokes: InkPoint[][]): InkPoint[][] {
  const all = strokes.flat();
  if (all.length < 8) return strokes;
  const clusters = clusterPointsByX(all, 0.16);
  if (clusters.length < 2) return strokes;
  const heights = clusters.map((cluster) => {
    const ys = cluster.map((point) => point.y);
    return Math.max(...ys) - Math.min(...ys);
  });
  const ordered = [...heights].sort((left, right) => left - right);
  const median = ordered[Math.floor(ordered.length / 2)];
  if (median < 6) return strokes;
  // Körperklasse = untere Gruppe der größten Lücke; nur sie wird geeicht.
  // Auf-/Unterlängen behalten ihre Höhe relativ zum Körper (Probe 10.9.2026:
  // der Median-Faktor drückte Aufsteiger um bis zu 12 % auf Körpermaß, weil die
  // Referenz "Median aller Cluster" auch für sie galt).
  let widestGap = -1;
  let cut = ordered.length - 1;
  for (let index = 0; index + 1 < ordered.length; index += 1) {
    const gap = ordered[index + 1] - ordered[index];
    if (gap > widestGap) { widestGap = gap; cut = index; }
  }
  const bodyHeights = widestGap >= median * 0.25 ? ordered.slice(0, cut + 1) : ordered;
  const bodyTarget = bodyHeights[Math.floor(bodyHeights.length / 2)];
  const bodyLimit = bodyHeights[bodyHeights.length - 1] + Math.max(1, bodyTarget * 0.04);
  const factorOf = new Map<InkPoint, number>();
  clusters.forEach((cluster, index) => {
    // Körperbuchstaben laufen behutsam zusammen (±12 %); alles darüber (l, t, d, k)
    // bleibt unangetastet, damit die Proportion zum Körper erhalten bleibt.
    const factor = heights[index] <= bodyLimit
      ? Math.min(1.12, Math.max(0.88, bodyTarget / heights[index]))
      : 1;
    for (const point of cluster) factorOf.set(point, factor);
  });
  // Rigid per-stroke factor (Feedback 10.9.2026): ein Strich, der zwei Cluster
  // schneidet, darf nicht innerhalb der Kontur knicken — der dominante Cluster
  // entscheidet einmal für den ganzen Strich. Unterkanten bleiben fix.
  return strokes.map((points) => {
    const bottom = Math.max(...points.map((candidate) => candidate.y));
    const factors = points.map((point) => factorOf.get(point)).filter((factor): factor is number => factor !== undefined).sort((left, right) => left - right);
    if (!factors.length) return points.map((point) => ({ ...point }));
    const factor = factors[Math.floor(factors.length / 2)];
    return points.map((point) => ({ ...point, y: bottom - (bottom - point.y) * factor }));
  });
}

/** Height-only correction at the captured bottom edge. Legacy layout options are ignored. */
export function normalizeHandwritingV2(source: StrokeElement[], options: HandwritingV2Options): HandwritingV2Result {
  const valid=source.filter(s=>!s.normalizedWordId && s.points.length && s.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
  if(!valid.length) return {strokes:source,baseline:0,endX:0};
  const boxes=valid.map(elementBounds);
  const top=Math.min(...boxes.map(b=>b.minY)),bottom=Math.max(...boxes.map(b=>b.maxY));
  const height=Math.max(16,Math.min(96,options.height));
  // Do not enlarge isolated punctuation or horizontal bars into full-height letters.
  // Nutzervorgabe 8.9.2026: Wörter nicht plattdrücken oder aufblasen — die
  // Papier-Zielhöhe ist Richtwert, nie eine Presse. Große Wörter behalten
  // mindestens 75 % ihrer erfassten Höhe, kleine wachsen höchstens auf 135 %.
  // Gentle-Refinement: Korrekturen unter ~3 % sind unsichtbar ⇒ Original bleibt;
  // darüber greift die Zielhöhe als Richtwert mit Verhältnis-Kappen.
  // Nutzerauftrag 10.9.2026 (Probe): Zielhöhe auf die KÖRPERHÖHE (x-Höhe)
  // rechnen, nicht auf die volle Worthöhe — sonst hängt die Buchstabengröße
  // davon ab, ob das Wort Ober-/Unterlängen hat. Die Verhältnis-Kappen bleiben
  // auf die Worthöhe bezogen (75 % / 135 % der erfassten Höhe).
  const bodyHeight=estimateBodyHeight(valid.map(stroke=>stroke.points),bottom-top);
  const scale=bottom-top<5 || bodyHeight<5 ? 1
    : (Math.abs(height/bodyHeight-1)<0.03 ? 1 : Math.min(Math.max(height/bodyHeight, HEIGHT_RATIO_MIN), HEIGHT_RATIO_MAX));
  const targetTop=bottom-(bottom-top)*scale;
  if(targetTop<0 || bottom>options.pageHeight || boxes.some(b=>b.minX<0 || b.maxX>options.pageWidth)) {
    throw new Error("Für diese Höhe fehlt hier Platz. Das Original bleibt an seiner Position.");
  }
  const wordId=crypto.randomUUID();
  // Reihenfolge nach Nutzervorgabe: gerade machen → schließen → entzerren →
  // Höhe (Verhältnis-Kappen) → sanftes Applien.
  const arrays=valid.map(stroke=>smoothOwnInk(stroke.points,options.strength))
    .map(points=>options.closeLoops===false ? points : closeOwnInkLoop(points));
  const equalized=options.equalize ? equalizeWordInk(arrays) : arrays;
  // Equalization already changes height. Fit its result to the capped ORIGINAL
  // word height, rather than multiplying two independently bounded scales.
  // Die Skala wirkt auf die bereits geglättete/entzerrte Tinte, deshalb wird sie
  // an DIESER Spanne gemessen (vorher wurde die Spanne der Rohpunkte gegen die
  // geglättete Oberkante gemischt — die Zielhöhe verfehlte dadurch 0,16–0,4 px)
  // und an ihrer eigenen Unterkante verankert, damit die Grundlinie nicht wandert.
  const equalizedTop=equalized.reduce((min,points)=>points.reduce((y,p)=>Math.min(y,p.y),min),bottom);
  const equalizedBottom=equalized.reduce((max,points)=>points.reduce((y,p)=>Math.max(y,p.y),max),top);
  const equalizedHeight=equalizedBottom-equalizedTop;
  const heightScale=bottom-top<5 || equalizedHeight<5 ? 1 : (scale*(bottom-top))/equalizedHeight;
  const normalized=valid.map((stroke,index)=>{
    const points=equalized[index].map(p=>({...p,y:equalizedBottom-(equalizedBottom-p.y)*heightScale}));
    return {...stroke,inkGeometry:"captured" as const,normalizedWordId:wordId,rawPoints:stroke.rawPoints ?? structuredClone(stroke.points),
      points:options.smooth ? smoothInkLines(points) : points};
  });
  const byId=new Map(normalized.map(s=>[s.id,s]));
  return {strokes:source.map(s=>byId.get(s.id)??s),baseline:bottom,endX:Math.max(...boxes.map(b=>b.maxX))};
}
