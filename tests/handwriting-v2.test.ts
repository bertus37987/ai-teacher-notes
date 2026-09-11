import assert from "node:assert/strict";
import { normalizeHandwritingV2, HandwritingV2Options } from "../src/handwriting-v2";
import { StrokeElement, elementBounds } from "../src/document";
import { optimizeShape } from "../src/shapes";
import { decodeCtcConfidence } from "../src/htr-core";
const options:HandwritingV2Options={height:36,strength:.8,spacing:.2,lockRows:true,pageWidth:1200,pageHeight:1697,paper:"grid",baseline:144};
const letter=(id:string,x:number,y:number,height:number):StrokeElement=>({type:"stroke",id,color:"#111",size:3,points:Array.from({length:30},(_,i)=>({x:x+i*.4+Math.sin(i)*.8,y:y+height*i/29,pressure:.5}))});
const source=[letter("a",40,91,25),letter("b",58,89,42),letter("c",76,99,33)];
const original=structuredClone(source), result=normalizeHandwritingV2(source,{...options,strength:0});
assert.deepEqual(source,original,"normalization cannot mutate the captured source");
for(const stroke of result.strokes) {
  const b=elementBounds(stroke),raw=elementBounds(source.find(s=>s.id===stroke.id)!);
  const ratio=(b.maxY-b.minY)/(raw.maxY-raw.minY);
  assert.ok(ratio>=.75-1e-9&&ratio<=1.35+1e-9,"word scale stays inside the 75 % / 135 % caps");
  assert.deepEqual(stroke.rawPoints,source.find(s=>s.id===stroke.id)!.points);
}
const boxes=result.strokes.map(elementBounds);
assert.equal(Math.max(...boxes.map(b=>b.maxY)),132,"captured word bottom stays fixed");

// Kern-Reparatur der Handschrift-Probe (10.9.2026): derselbe Körperbuchstabe
// muss in einem Wort MIT Aufsteigern genauso groß werden wie in einem reinen
// Körperwort. Vorher wuchs das Körperwort (Ziel/Worthöhe) und das Aufsteiger-
// Wort wurde gestaucht — 41 % Größenunterschied beim selben Buchstaben.
const bodyOnly:StrokeElement={type:"stroke",id:"only",color:"#111",size:3,points:Array.from({length:30},(_,i)=>({x:40+i*.4,y:110+22*i/29,pressure:.5}))};
const tallOne:StrokeElement={type:"stroke",id:"tall",color:"#111",size:3,points:Array.from({length:30},(_,i)=>({x:60+i*.4,y:92+40*i/29,pressure:.5}))};
const bodyWord=normalizeHandwritingV2([bodyOnly],options).strokes.map(elementBounds);
const mixedWord=normalizeHandwritingV2([{...bodyOnly,id:"only2"},{...tallOne}],options).strokes.map(elementBounds);
assert.ok(Math.abs((bodyWord[0].maxY-bodyWord[0].minY)-(mixedWord[0].maxY-mixedWord[0].minY))<1,"same letter keeps the same size in a word with ascenders");
// Zielhöhe = KÖRPERHÖHE des Wortes (Handschrift-Probe 10.9.2026): vorher bezog
// sie sich auf die volle Worthöhe, dadurch wurde derselbe Buchstabe im Wort mit
// Aufsteigern kleiner als im reinen Körperwort (gemessen 35,4 px vs. 49,9 px).
assert.ok(Math.abs((boxes[2].maxY-boxes[2].minY)/33-36/33)<.02,"body-sized letters reach the target height");
assert.ok(Math.abs(Math.max(...boxes.map(b=>b.maxY))-132)<1e-9,"word keeps its captured baseline");
assert.equal(boxes[1].minX-boxes[0].maxX,elementBounds(source[1]).minX-elementBounds(source[0]).maxX,"letter spacing is unchanged");
const following=normalizeHandwritingV2([letter("d",90,109,30)],{...options,startX:result.endX+8});
assert.equal(elementBounds(following.strokes[0]).minX,90);
assert.equal(elementBounds(following.strokes[0]).maxY,139,"next word stays where it was written");
const loop:StrokeElement={type:"stroke",id:"loop",color:"#111",size:3,points:Array.from({length:97},(_,i)=>{const angle=i*Math.PI*2/96;return {x:240+Math.cos(angle)*(90+Math.sin(i*3)*2),y:240+Math.sin(angle)*(77+Math.cos(i*2)*2),pressure:.5};})};
const circle=optimizeShape(loop,1); assert.equal(circle.kind,"ellipse");
const circleBox=elementBounds({...circle.stroke,type:"stroke"});
assert.ok(Math.abs((circleBox.maxX-circleBox.minX)-(circleBox.maxY-circleBox.minY))<1e-8,"100% produces mathematically equal circle diameters");
const disabled=optimizeShape(loop,0); assert.equal(disabled.kind,null);
const confident=decodeCtcConfidence([0,10,0, 10,0,0, 0,0,10],[1,3,3],"ou");
assert.equal(confident.text,"ou"); assert.ok(confident.confidence>.99);
const uncertain=decodeCtcConfidence([0, .1, 0],[1,1,3],"ou"); assert.ok(uncertain.confidence<.5);
console.log("Handwriting v2 sizing spacing rows circles and recognition confidence tests passed");
