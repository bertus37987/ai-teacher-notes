import {HandwritingPage,ImageElement} from "./document";

type Box={x:number;y:number;width:number;height:number};
export function resizeNotebookImage(box:Box,corner:string,dx:number,dy:number,page:{width:number;height:number}):Box {
  const west=corner.includes("w"),north=corner.includes("n");
  const anchorX=west ? box.x+box.width : box.x,anchorY=north ? box.y+box.height : box.y;
  const sx=1+(west ? -dx : dx)/box.width,sy=1+(north ? -dy : dy)/box.height;
  const wanted=Math.abs(dx/box.width)>=Math.abs(dy/box.height) ? sx : sy;
  const max=Math.min((west ? anchorX : page.width-anchorX)/box.width,(north ? anchorY : page.height-anchorY)/box.height);
  const min=Math.min(max,24/Math.min(box.width,box.height));
  const scale=Math.max(min,Math.min(max,wanted));
  const width=box.width*scale,height=box.height*scale;
  return {x:west ? anchorX-width : anchorX,y:north ? anchorY-height : anchorY,width,height};
}

/** Draft-only editing: moving a photo never moves or deletes the ink above it. */
export function editNotebookImage(page:HandwritingPage,original:ImageElement,surface:HTMLElement,signal:AbortSignal):Promise<ImageElement|"delete"|null> {
  const draft={...original};
  const box=document.createElement("div");box.className="hp-object-editor hp-image-editor";box.tabIndex=0;
  box.setAttribute("role","dialog");box.setAttribute("aria-label","Bild bearbeiten");
  const preview=document.createElement("img");preview.src=draft.dataUrl;preview.alt=draft.sourceName ?? "Importiertes Bild";preview.draggable=false;
  const bar=document.createElement("div");bar.className="hp-object-bar hp-object-actions";
  const dimensions=document.createElement("output");dimensions.className="hp-image-dimensions";dimensions.setAttribute("aria-label","Bildgröße");
  function button(label:string,symbol:string,action:()=>void):HTMLButtonElement {
    const b=document.createElement("button");b.type="button";b.textContent=symbol;b.title=label;b.setAttribute("aria-label",label);b.onclick=action;bar.append(b);return b;
  }
  let finish:(value:ImageElement|"delete"|null)=>void=()=>{};
  const move=button("Bild verschieben","⠿",()=>{});move.className="hp-object-move";
  bar.append(dimensions);
  button("Bild entfernen","Entfernen",()=>finish("delete"));
  button("Bildänderung abbrechen","×",()=>finish(null));
  button("Bild übernehmen","✓",()=>finish(draft));
  box.append(preview,bar);surface.append(box);
  function layout():void {
    const scale=surface.getBoundingClientRect().width/page.width;
    box.style.left=`${draft.x*scale}px`;box.style.top=`${draft.y*scale}px`;
    box.style.width=`${draft.width*scale}px`;box.style.height=`${draft.height*scale}px`;
    box.classList.toggle("controls-below",draft.y*scale<65);
    bar.style.left=`${Math.min(0,(page.width-draft.x)*scale-bar.offsetWidth)}px`;
    dimensions.textContent=`${Math.round(draft.width)} × ${Math.round(draft.height)}`;
  }
  function moveBy(dx:number,dy:number,from:Box=draft):void {
    draft.x=Math.max(0,Math.min(page.width-draft.width,from.x+dx));
    draft.y=Math.max(0,Math.min(page.height-draft.height,from.y+dy));layout();
  }
  function drag(target:HTMLElement,corner=""):void {
    target.onpointerdown=e=>{
      if(e.button!==0)return;e.preventDefault();target.setPointerCapture(e.pointerId);
      const start={...draft},x=e.clientX,y=e.clientY;
      target.onpointermove=event=>{
        const scale=surface.getBoundingClientRect().width/page.width,dx=(event.clientX-x)/scale,dy=(event.clientY-y)/scale;
        if(corner){Object.assign(draft,resizeNotebookImage(start,corner,dx,dy,page));layout();}else moveBy(dx,dy,start);
      };
      target.onpointerup=target.onpointercancel=()=>{target.onpointermove=null;if(target.hasPointerCapture(e.pointerId))target.releasePointerCapture(e.pointerId);};
    };
  }
  drag(preview);drag(move);
  for(const [corner,label] of [["nw","oben links"],["ne","oben rechts"],["sw","unten links"],["se","unten rechts"]]) {
    const handle=document.createElement("button");handle.type="button";handle.className=`hp-object-resize hp-resize-${corner}`;handle.setAttribute("aria-label",`Bildgröße ziehen ${label}`);box.append(handle);drag(handle,corner);
  }
  const observer=new ResizeObserver(layout);observer.observe(surface);layout();box.focus();box.scrollIntoView({block:"nearest"});
  return new Promise(resolve=>{
    let done=false;
    const abort=()=>finish(null);
    const outside=(e:PointerEvent)=>{if(e.target instanceof Node&&!box.contains(e.target)){e.preventDefault();e.stopPropagation();finish(draft);}};
    finish=value=>{if(done)return;done=true;observer.disconnect();document.removeEventListener("pointerdown",outside,true);signal.removeEventListener("abort",abort);box.remove();resolve(value);};
    document.addEventListener("pointerdown",outside,true);signal.addEventListener("abort",abort,{once:true});if(signal.aborted){finish(null);return;}
    box.onkeydown=e=>{
      if(e.key==="Escape"){e.stopPropagation();finish(null);}
      else if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){e.preventDefault();finish(draft);}
      else if(e.key.startsWith("Arrow")){
        e.preventDefault();e.stopPropagation();const step=e.shiftKey?10:1;
        const dx=e.key==="ArrowLeft"?-step:e.key==="ArrowRight"?step:0,dy=e.key==="ArrowUp"?-step:e.key==="ArrowDown"?step:0;
        const target=e.target as HTMLElement,corner=["nw","ne","sw","se"].find(c=>target.classList.contains(`hp-resize-${c}`));
        if(corner){Object.assign(draft,resizeNotebookImage(draft,corner,dx,dy,page));layout();}else moveBy(dx,dy);
      }
    };
  });
}

export function waitForNotebookImage(image:HTMLImageElement):Promise<void> {
  if(image.complete)return image.naturalWidth>0 ? Promise.resolve() : Promise.reject(new Error("Bild konnte nicht geladen werden"));
  return new Promise((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timer);image.removeEventListener("load",loaded);image.removeEventListener("error",failed);};
    const loaded=()=>{cleanup();resolve();};const failed=()=>{cleanup();reject(new Error("Bild konnte nicht exportiert werden"));};
    const timer=setTimeout(()=>{cleanup();reject(new Error("Bildladen dauerte zu lange. Bitte Export erneut versuchen."));},10000);
    image.addEventListener("load",loaded,{once:true});image.addEventListener("error",failed,{once:true});
  });
}
