import assert from "node:assert/strict";
import {shapeMeasurements,drawShapeMeasurements} from "../src/shape-measurements";
import {draggedShapePoints,ShapeDragTool} from "../src/shapes";
import {ShapeElement} from "../src/document";
const make=(tool:ShapeDragTool,x=240,y=200):ShapeElement=>({type:"shape",id:tool,kind:tool==="circle"||tool==="ellipse" ? "ellipse" : tool==="triangle"||tool==="diamond" ? "polygon" : tool,points:draggedShapePoints(tool,{x:40,y:40,pressure:.5},{x,y,pressure:.5}),closed:tool!=="line"&&tool!=="arrow",color:"#111",size:3,showMeasurements:true});
for(const [tool,sum] of [["triangle",180],["diamond",360],["rectangle",360]] as const) {
  const shape=make(tool),measurements=shapeMeasurements(shape);
  assert.ok(Math.abs(measurements.reduce((sum,m)=>sum+m.degrees!,0)-sum)<1e-8);
  const reversed={...shape,points:[...shape.points].reverse()};
  assert.ok(Math.abs(shapeMeasurements(reversed).reduce((sum,m)=>sum+m.degrees!,0)-sum)<1e-8);
}
assert.equal(shapeMeasurements(make("circle"))[0].degrees,360);
for(const end of [{x:1200,y:1600},{x:0,y:1600},{x:1200,y:0},{x:0,y:0}]) {
  const points=draggedShapePoints("circle",{x:1100,y:100,pressure:.5},{...end,pressure:.5},{width:1200,height:1697});
  assert.ok(points.every(p=>p.x>=0&&p.x<=1200&&p.y>=0&&p.y<=1697));
  assert.equal(Math.abs(points[1].x-points[0].x),Math.abs(points[1].y-points[0].y));
}
assert.match(shapeMeasurements(make("circle"))[0].text,/r 100 px/);
assert.equal(shapeMeasurements(make("ellipse"))[0].degrees,undefined,"an oval has no corner angles");
assert.equal(shapeMeasurements(make("line",240,40))[0].degrees,0);
assert.equal(shapeMeasurements(make("line",40,200))[0].degrees,270);
assert.deepEqual(shapeMeasurements(make("triangle",40,40)),[],"degenerate shapes must not display invented angles");
const labels:string[]=[];
const ctx={save(){},restore(){},measureText(value:string){return {width:value.length*8};},fillRect(){},fillText(value:string){labels.push(value);}} as unknown as CanvasRenderingContext2D;
drawShapeMeasurements(ctx,make("triangle")); assert.equal(labels.length,3);
drawShapeMeasurements(ctx,{...make("circle"),showMeasurements:false}); assert.equal(labels.length,3,"disabled labels are not rendered");
console.log("Shape angle sums, directions, circle radius and rendered labels tests passed");
