import assert from "node:assert/strict";
import {PAPER_WRITING_DEFAULTS,paperWritingLayout,splitNewInkWords} from "../src/handwriting-layout";
import {normalizeHandwritingV2,HEIGHT_RATIO_MIN,HEIGHT_RATIO_MAX} from "../src/handwriting-v2";
import {StrokeElement,elementBounds,createDocument,parseDocument} from "../src/document";
const settings={...PAPER_WRITING_DEFAULTS};
assert.deepEqual(paperWritingLayout("grid",settings),{height:48});
assert.deepEqual(paperWritingLayout("lines",settings),{height:32});
assert.deepEqual(paperWritingLayout("grid",{...settings,gridWritingHeight:1.5}),{height:36});
const stroke=(id:string,x:number):StrokeElement=>({type:"stroke",id,color:"#111",size:3,points:[{x,y:100,pressure:.5},{x:x+5,y:120,pressure:.5},{x:x+12,y:150,pressure:.5}]});
const fresh=[stroke("a",40),stroke("b",59)];
for(const paper of ["grid","lines"] as const) {
  const layout=paperWritingLayout(paper,settings),opts={...layout,paper,strength:.8,spacing:.2,lockRows:true,pageWidth:1200,pageHeight:1697};
  // Nutzervorgabe 8.9.2026: Zielhöhe ist Richtwert mit Verhältnis-Kappen.
  const rawHeight=50,scale=Math.min(Math.max(layout.height/rawHeight,HEIGHT_RATIO_MIN),HEIGHT_RATIO_MAX),expected=rawHeight*scale;
  const first=normalizeHandwritingV2(fresh,opts);
  for(const s of first.strokes) {const b=elementBounds(s);assert.ok(Math.abs(b.maxY-b.minY-expected)<1e-6,`${paper}: erwartet ${expected}, war ${b.maxY-b.minY}`);assert.ok(s.normalizedWordId);}
  const snapshot=JSON.stringify(first.strokes);
  assert.equal(JSON.stringify(normalizeHandwritingV2(first.strokes,{...opts,height:64}).strokes),snapshot,"already processed words never resize on subsequent passes");
  const mixed=normalizeHandwritingV2([...first.strokes,stroke("new",160)],opts);
  assert.equal(JSON.stringify(mixed.strokes.slice(0,2)),snapshot,"new input cannot alter old strokes");
  const doc=createDocument(paper);doc.pages[0].elements=first.strokes;
  const loaded=parseDocument(JSON.parse(JSON.stringify(doc)))!.document.pages[0].elements as StrokeElement[];
  assert.equal(JSON.stringify(normalizeHandwritingV2(loaded,opts).strokes),snapshot,"once-only guard survives save/reopen");
}
assert.deepEqual(splitNewInkWords([stroke("a",40),stroke("b",59),stroke("c",170)]).map(w=>w.map(s=>s.id)),[["a","b"],["c"]]);
console.log("Once-only smoothing, stable old words, persisted guards and paper-height defaults tests passed");
