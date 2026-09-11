import {ShapeElement, elementBounds} from "./document";

export interface ShapeMeasurement {x:number;y:number;text:string;degrees?:number}
const degrees=(radians:number)=>radians*180/Math.PI;
const format=(value:number)=>`${Number(value.toFixed(1))}°`;

/** Measurements describe geometry, never calibrated physical lengths. */
export function shapeMeasurements(shape:ShapeElement):ShapeMeasurement[] {
  if(shape.points.length<2) return [];
  const b=elementBounds(shape),cx=(b.minX+b.maxX)/2,cy=(b.minY+b.maxY)/2;
  const width=b.maxX-b.minX,height=b.maxY-b.minY;
  if(shape.kind==="ellipse") {
    if(width<1 || height<1) return [];
    return [{x:cx,y:cy,text:Math.abs(width-height)<.01 ? `360° · r ${Number((width/2).toFixed(1))} px` : `Oval · ${Math.round(width)} × ${Math.round(height)} px`,...(Math.abs(width-height)<.01 ? {degrees:360} : {})}];
  }
  if(shape.kind==="line" || shape.kind==="arrow") {
    const a=shape.points[0],z=shape.points.at(-1)!;
    if(Math.hypot(z.x-a.x,z.y-a.y)<1) return [];
    const angle=(degrees(Math.atan2(a.y-z.y,z.x-a.x))+360)%360;
    return [{x:(a.x+z.x)/2,y:(a.y+z.y)/2-24,text:format(angle),degrees:angle}];
  }
  let points=shape.kind==="rectangle" ? [{x:b.minX,y:b.minY},{x:b.maxX,y:b.minY},{x:b.maxX,y:b.maxY},{x:b.minX,y:b.maxY}] : shape.points;
  if(points.length>2 && Math.hypot(points[0].x-points.at(-1)!.x,points[0].y-points.at(-1)!.y)<.001) points=points.slice(0,-1);
  if(!shape.closed || points.length<3) return [];
  const area=points.reduce((sum,p,i)=>{const next=points[(i+1)%points.length];return sum+p.x*next.y-next.x*p.y;},0);
  if(Math.abs(area)<.001) return [];
  return points.flatMap((p,i)=> {
    const prev=points[(i+points.length-1)%points.length],next=points[(i+1)%points.length];
    const ax=prev.x-p.x,ay=prev.y-p.y,bx=next.x-p.x,by=next.y-p.y;
    if(Math.hypot(ax,ay)<.001 || Math.hypot(bx,by)<.001) return [];
    let angle=degrees(Math.atan2(Math.abs(ax*by-ay*bx),ax*bx+ay*by));
    if((ax*by-ay*bx)*area>0) angle=360-angle;
    const d=Math.hypot(cx-p.x,cy-p.y)||1, inset=Math.min(40,d*.45);
    return [{x:p.x+(cx-p.x)/d*inset,y:p.y+(cy-p.y)/d*inset,text:format(angle),degrees:angle}];
  });
}

export function drawShapeMeasurements(ctx:CanvasRenderingContext2D,shape:ShapeElement):void {
  if(!shape.showMeasurements) return;
  const box=elementBounds(shape);
  // Avoid unreadable piles of labels while a shape is only a few pixels wide.
  if(shape.closed && Math.min(box.maxX-box.minX,box.maxY-box.minY)<90) return;
  ctx.save(); ctx.font="18px Arial, sans-serif"; ctx.textAlign="center"; ctx.textBaseline="middle";
  for(const label of shapeMeasurements(shape)) {
    const w=ctx.measureText(label.text).width+12;
    ctx.fillStyle="#faf7ff";ctx.fillRect(label.x-w/2,label.y-13,w,26);
    ctx.fillStyle="#653499";ctx.fillText(label.text,label.x,label.y);
  }
  ctx.restore();
}
