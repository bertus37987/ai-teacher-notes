import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {closeOwnInkLoop,normalizeHandwritingV2,smoothOwnInk,HandwritingV2Options} from "../src/handwriting-v2";
import {StrokeElement,elementBounds} from "../src/document";
import {drawInkStroke} from "../src/rendering";
const options:HandwritingV2Options={height:48,strength:1,spacing:.16,lockRows:true,pageWidth:1200,pageHeight:1697,paper:"grid",rowStep:72};
const stroke=(id:string,xy:number[][]):StrokeElement=>({type:"stroke",id,color:"#111",size:3,points:xy.map(([x,y],i)=>({x,y,pressure:.2+i*.01,time:100+i*10}))});
const w=stroke("W",[[150,180],[158,210],[167,191],[176,210],[184,180]]);
assert.deepEqual(smoothOwnInk(w.points,1),w.points,"sparse W tips must not be rounded into a U");
const jitter=stroke("jitter",Array.from({length:30},(_,i)=>[100+(i%2 ? .25 : -.25),80+i*3]));
const calmer=smoothOwnInk(jitter.points,1);
assert.ok(calmer.slice(1,-1).reduce((sum,p)=>sum+Math.abs(p.x-100),0)/28<.15,"subpixel jitter becomes straighter without redrawing letters");
const out=normalizeHandwritingV2([w],options).strokes[0];
assert.equal(out.type,"stroke");assert.equal(out.inkGeometry,"captured");
assert.deepEqual(out.rawPoints,w.points);
const normalizedHeight=elementBounds(out).maxY-elementBounds(out).minY;
// Nutzervorgabe 8.9.2026: Verhältnis-Kappen statt Presse — ein 30-px-W zur
// Zielhöhe 48 wächst nur auf 135 % der eigenen Höhe, nicht auf exakt 48.
assert.ok(Math.abs(normalizedHeight-40.5)<1e-6,`erwartet 40.5, war ${normalizedHeight}`);
assert.ok(normalizedHeight>30 && normalizedHeight<48,"kein exaktes Pressen, kein volles Aufblasen");
assert.ok(out.points[2].y<out.points[1].y-25 && out.points[2].y<out.points[3].y-25);
assert.deepEqual(out.points.map(p=>[p.pressure,p.time]),w.points.map(p=>[p.pressure,p.time]));
const arc=(start:number,end:number)=>stroke("oval",Array.from({length:60},(_,i)=>{const a=start+(end-start)*i/59;return [50+15*Math.cos(a),80+21*Math.sin(a)];}));
const o=arc(.15,Math.PI*2-.1),closed=closeOwnInkLoop(o.points);
assert.equal(closed.length,o.points.length+5,"tiny gap gets a short arc bridge, not a flat chord");
assert.deepEqual(closed.slice(0,-5),o.points,"original contour stays identical, bridge appended only");
assert.equal(closed[0].x,closed.at(-1)!.x);assert.equal(closed[0].y,closed.at(-1)!.y);
// Nutzerauftrag 10.9.2026 („Ovale werden nicht geschlossen"): Ein tiefer Bogen mit nur
// ~29 % Öffnung ist geometrisch nicht von einem Oval zu unterscheiden (beide sweepPi
// ≈1,45–1,58, positiver Rücklauf-Kosinus) — hier gewinnt bewusst das Schließen. Ein
// offen gezeichnetes C (≥ 40 % Öffnung) bleibt unangetastet.
const c=arc(.9,.9+Math.PI*1.1);
assert.deepEqual(closeOwnInkLoop(c.points),c.points,"deliberate C remains open");
const deepArc=arc(.9,Math.PI*2-.9);
assert.equal(closeOwnInkLoop(deepArc.points).length,deepArc.points.length+5,"sehr tief gezogener Bogen gilt als Oval und wird geschlossen");
assert.deepEqual(closeOwnInkLoop(w.points),w.points,"W never closes");
assert.equal(normalizeHandwritingV2([o],{...options,closeLoops:false}).strokes[0].points.length,o.points.length);
const zero=normalizeHandwritingV2([arc(0,Math.PI*2)],options).strokes[0];
assert.equal(zero.type,"stroke","0/o is not guessed as a letter");
const stem=stroke("stem",[[50,100],[52,120],[54,140]]),dot=stroke("dot",[[57,94]]);
const dotted=normalizeHandwritingV2([stem,dot],options).strokes;
assert.ok(Math.abs((dotted[1].points[0].x-dotted[0].points[0].x)-7)<.001,"an offset dot keeps its horizontal position relative to its stem");
const shifted=normalizeHandwritingV2([w],{...options,startX:90});
assert.equal(elementBounds(shifted.strokes[0]).minX,150,"legacy spacing options cannot move the word");
assert.equal(elementBounds(shifted.strokes[0]).maxY,210,"captured bottom edge never snaps to another line");
assert.deepEqual(normalizeHandwritingV2([out],{...options,height:32}).strokes[0],out,"processed words stay unchanged after paper/settings change");
let curves=0,lines=0;
const ctx={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){lines++;},quadraticCurveTo(){curves++;},stroke(){}} as unknown as CanvasRenderingContext2D;
drawInkStroke(ctx,out);assert.equal(lines,0,"renderer draws uniform curves, no polygon ink");assert.equal(curves,out.points.length-1);
const main=readFileSync("src/main.ts","utf8");
const automatic=main.slice(main.indexOf("private async normalizeWordV2"),main.indexOf("private clearPendingNormalization"));
assert.ok(!/recognizeDetailed|reconstructLine|Teacher Caveat|recognizeRepairableGlyph/.test(automatic),"auto pipeline must not call OCR/font reconstruction even with old settings");
// Live-Umwandlung läuft NACH normalizeWordV2: Die normalisierten Striche behalten ihre id, tragen aber
// normalizedWordId. Wer dort nach !normalizedWordId filtert, macht die Live-Umwandlung zum stillen No-Op.
const live=main.slice(main.indexOf("private async liveConvertInk"),main.indexOf("private setStatus"));
assert.ok(!/!\s*e\.normalizedWordId/.test(live),"live conversion must not skip the strokes it just normalized");
const liveSource=normalizeHandwritingV2([w],options).strokes;
assert.ok(liveSource.every(s=>s.normalizedWordId && w.id===s.id),"normalized ink keeps its id and is marked, so id lookup still finds it");
// Review-Befunde 10.9.2026: (1) Live-Umwandlung darf Zeichnungen nicht in Text verwandeln und muss vor dem
// Ersetzen einen Undo-Snapshot nehmen. (2) Halten im Schreibmodus braucht eine Größenschwelle, sonst wird
// ein geschriebenes „o“ beim kurzen Innehalten zur Form.
assert.ok(/isDrawingCluster/.test(live),"live conversion must respect the drawing protection");
assert.ok(/this\.remember\(\)/.test(live),"live conversion snapshots undo state before replacing ink");
assert.ok(!/if\s*\(lines\.length\)\s*\{\s*this\.markChanged/.test(live),"a fully skipped conversion must not schedule a save");
const holdGate=main.slice(main.indexOf("private convertAutomaticShape"),main.indexOf("private convertAutomaticShape")+800);
assert.ok(/HOLD_SNAP_MIN_WRITING/.test(holdGate)&&/handwritingMode/.test(holdGate),"held strokes in writing mode need a size gate so letters stay letters");
const holdMin=Number(/-?const HOLD_SNAP_MIN_WRITING\s*=\s*(\d+)/.exec(main)?.[1]);
assert.ok(holdMin>28&&holdMin<60,"hold gate sits above letter size and below deliberate shapes");

// Nutzerauftrag 10.9.2026 („Begradigen geht für Buchstaben noch nicht gut"): Der
// Tiefpass kann eine weiche Biegung nicht entfernen — gemessen blieb ein 2-px-Bogen am
// Buchstabenstamm zu 99 % stehen. Läufe zwischen den Ankern werden jetzt geometrisch
// auf ihre Sehne gezogen; echte Bögen (c, u) bleiben unangetastet.
const deviation=(points:typeof w.points):number=>{const a=points[0],b=points.at(-1)!;const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;return points.reduce((sum,p)=>sum+Math.abs((p.x-a.x)*dy-(p.y-a.y)*dx)/len,0)/points.length;};
const bowHeight=(points:typeof w.points):number=>{const a=points[0],b=points.at(-1)!;const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;return Math.max(...points.map(p=>Math.abs((p.x-a.x)*dy-(p.y-a.y)*dx)/len));};
const letterStem=stroke("letterStem",Array.from({length:26},(_,i)=>{const t=i/25;return [100+Math.sin(t*Math.PI)*2+Math.sin(i*1.7)*.8,100+40*t];}));
const stemErrorBefore=deviation(letterStem.points),stemErrorAfter=deviation(smoothOwnInk(letterStem.points,.8));
assert.ok(stemErrorAfter<stemErrorBefore*.35,`letter stems get straightened (${stemErrorBefore.toFixed(2)} px -> ${stemErrorAfter.toFixed(2)} px)`);
const curveArc=stroke("curveArc",Array.from({length:24},(_,i)=>{const a=-1.2+2.4*i/23;return [100+Math.cos(a)*20+Math.sin(i*2.1)*.6,100+Math.sin(a)*20+Math.cos(i*1.6)*.6];}));
const bowBefore=bowHeight(curveArc.points),bowAfter=bowHeight(smoothOwnInk(curveArc.points,1));
assert.ok(bowAfter>bowBefore*.92,`real curves keep their bow (${bowBefore.toFixed(1)} px -> ${bowAfter.toFixed(1)} px)`);

// Nutzerentscheidung 11.9.2026: erkannte/gehaltene Formen bleiben reine Kontur —
// keine automatische Füllung, auch nicht verzögert (Befund „leuchtende Füllung").
assert.ok(!/scheduleShapeFill|HOLD_SHAPE_FILL_DELAY/.test(main),"shapes must not fill themselves automatically");

// Fund 10.9.2026: pointerUp rief zuerst pointerMove(up) auf; das setzte lastMoveTs auf den
// Up-Zeitstempel. Die Stillstandszeit war dadurch immer 0 ms und der Hold-Snap konnte nie auslösen.
const pointerUpBody = main.slice(main.indexOf("private pointerUp"), main.indexOf("private capturePointer"));
assert.ok(
  pointerUpBody.indexOf("const holdDetected") >= 0 &&
    pointerUpBody.indexOf("const holdDetected") < pointerUpBody.indexOf("this.pointerMove(event, pageId)"),
  "hold must be measured before the final pointerMove overwrites lastMoveTs"
);
console.log("Own-ink geometry, W corners, conservative loop closure, spacing and no automatic font replacement passed");
