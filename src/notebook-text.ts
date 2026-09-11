import { HandwritingPage, TextElement, elementBounds } from "./document";
import { wrapTextLines } from "./rendering";

export function resizeNotebookBox(box:{x:number;y:number;width:number;height:number}, corner:string, dx:number, dy:number, page:{width:number;height:number}):typeof box {
  const left=corner.includes("w") ? Math.max(0,Math.min(box.x+box.width-160,box.x+dx)) : box.x;
  const top=corner.includes("n") ? Math.max(0,Math.min(box.y+box.height-80,box.y+dy)) : box.y;
  return {x:left,y:top,width:corner.includes("w") ? box.x+box.width-left : Math.max(160,Math.min(page.width-box.x,box.width+dx)),height:corner.includes("n") ? box.y+box.height-top : Math.max(80,Math.min(page.height-box.y,box.height+dy))};
}

export function editNotebookText(page: HandwritingPage, color: string, surface: HTMLElement, original?: TextElement, table = false, position?: {x:number;y:number}, signal?:AbortSignal, onAbandoned?:(draft:TextElement)=>void): Promise<TextElement | null> {
  const draft: TextElement = original ? structuredClone(original) : { type: "text", id: crypto.randomUUID(), x: 40, baseline: 68, width: Math.min(520, page.width - 80), height: table ? 230 : 100, fontSize: 28, color, text: "", fontFamily: "sans", blockStyle: "body", ...(table ? { table: { cells: Array.from({ length: 4 }, () => ["", "", ""]) } } : {}) };
  if(!original) { const bottom=page.elements.filter(e=>e.type==="text").reduce((y,e)=>Math.max(y,elementBounds(e).maxY),16); draft.baseline=Math.min(page.height-250,bottom+24)+draft.fontSize; }
  if(!original && position) { draft.x=Math.max(0,Math.min(page.width-draft.width,position.x)); draft.baseline=Math.max(0,Math.min(page.height-(draft.height ?? 100),position.y))+draft.fontSize; }
  const box = document.createElement("div"); box.className = "hp-object-editor"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", draft.table ? "Tabelle bearbeiten" : "Textfeld bearbeiten");
  const tools = document.createElement("div"); tools.className = "hp-object-actions";
  const content = document.createElement("div"); content.className = "hp-object-content";
  const status = document.createElement("div"); status.className="hp-object-status"; status.setAttribute("role", "status");
  const input = document.createElement("textarea"); input.setAttribute("aria-label", "Textinhalt"); input.placeholder = "Hier schreiben …"; input.value = draft.text; input.oninput = () => { draft.text = input.value; };
  function button(label: string, action: () => void, symbol=label): HTMLButtonElement { const b = document.createElement("button"); b.type = "button"; b.textContent = symbol; b.setAttribute("aria-label",label); b.title=label; b.onclick = action; tools.append(b); return b; }
  const move = button("Verschieben", () => {}, "⠿"); move.className = "hp-object-move";
  const font = document.createElement("select"); font.setAttribute("aria-label", "Schriftgröße");
  for (const n of [...new Set([14, 18, 22, 28, 36, 48, draft.fontSize])].sort((a,b) => a-b)) { const o = document.createElement("option"); o.value = String(n); o.textContent = String(n); font.append(o); } font.value = String(draft.fontSize); tools.append(font);
  const bold = button("Fett", () => { draft.fontWeight = draft.fontWeight === 700 ? 400 : 700; style(); }, "B");
  const italic = button("Kursiv", () => { draft.fontStyle = draft.fontStyle === "italic" ? "normal" : "italic"; style(); }, "I");
  // Absatzart: Überschrift, Aufzählung, Nummerierung, Checkliste, Zitat, Code.
  // Die Marker werden von wrapTextLines schon gezeichnet — ohne diesen Umschalter
  // konnte ein Schüler sie aber nie erreichen (Paritäts-Audit, „Wichtig 1").
  const block = document.createElement("select"); block.setAttribute("aria-label", "Absatzart");
  for (const [value, label] of [["body", "Fließtext"], ["heading-1", "Überschrift 1"], ["heading-2", "Überschrift 2"], ["heading-3", "Überschrift 3"], ["bullet", "• Aufzählung"], ["numbered", "1. Nummeriert"], ["check", "☐ Checkliste"], ["quote", "› Zitat"], ["code", "Code"]] as const) {
    const o = document.createElement("option"); o.value = value; o.textContent = label; block.append(o);
  }
  block.value = draft.blockStyle ?? "body";
  block.onchange = () => { const gewaehlt = block.value as NonNullable<TextElement["blockStyle"]>; draft.blockStyle = gewaehlt; if (gewaehlt.startsWith("heading") && (draft.fontWeight ?? 400) < 700) draft.fontWeight = 700; style(); layout(); };
  tools.append(block);
  const align = document.createElement("select"); align.setAttribute("aria-label", "Textausrichtung");
  for (const [value, label] of [["left", "Links"], ["center", "Zentriert"], ["right", "Rechts"]]) { const o = document.createElement("option"); o.value = value; o.textContent = label; align.append(o); } align.value = draft.textAlign ?? "left"; align.onchange = () => { draft.textAlign = align.value as TextElement["textAlign"]; style(); }; tools.append(align);
  const sizes = document.createElement("div"); sizes.className = "hp-object-size";
  const dimensions = ["Breite", "Höhe"].map((name, i) => {
    const label = document.createElement("label"); label.textContent = name; const field = document.createElement("input"); field.type = "number"; field.setAttribute("aria-label", name); field.min = String(i ? 80 : 160); field.step = "10";
    const change = () => { const n = field.valueAsNumber; if (!Number.isFinite(n) || n < (i ? 80 : 160)) return; if (i) draft.height = Math.min(n, page.height - draft.baseline + draft.fontSize); else draft.width = Math.min(n, page.width - draft.x); layout(); };
    field.oninput=change; field.onchange=change; label.append(field); sizes.append(label); return field;
  });
  const more=document.createElement("details"); more.className="hp-object-dimensions"; const summary=document.createElement("summary"); summary.textContent="Maße"; more.append(summary,sizes); tools.append(more);
  const bar=document.createElement("div"); bar.className="hp-object-bar"; bar.append(tools);
  box.append(bar, content, status); surface.append(box);
  function style(): void {
    content.style.fontSize = `${draft.fontSize * surface.getBoundingClientRect().width / page.width}px`; content.style.fontWeight = String(draft.fontWeight ?? 400); content.style.fontStyle = draft.fontStyle ?? "normal"; content.style.color = draft.color; content.style.textAlign = draft.textAlign ?? "left";
    content.style.fontFamily=draft.fontFamily==="handwriting" ? '"Teacher Caveat", cursive' : draft.fontFamily==="mono" ? 'monospace' : draft.fontFamily==="serif" ? 'Georgia, serif' : 'Arial, sans-serif';
    bold.setAttribute("aria-pressed", String(draft.fontWeight === 700)); italic.setAttribute("aria-pressed", String(draft.fontStyle === "italic"));
    block.value = draft.blockStyle ?? "body";
  }
  function layout(): void {
    const scale = surface.getBoundingClientRect().width / page.width;
    bar.style.left=`${Math.min(0,window.innerWidth-16-surface.getBoundingClientRect().left-draft.x*scale-Math.min(520,bar.offsetWidth))}px`;
    box.classList.toggle("controls-below", draft.baseline-draft.fontSize<150);
    box.style.left = `${draft.x * scale}px`; box.style.top = `${(draft.baseline - draft.fontSize) * scale}px`; box.style.width = `${draft.width * scale}px`; content.style.height = `${(draft.height ?? 230) * scale}px`;
    dimensions[0].value = String(Math.round(draft.width)); dimensions[1].value = String(Math.round(draft.height ?? 230)); style();
  }
  font.onchange = () => { const top = draft.baseline - draft.fontSize; draft.fontSize = Number(font.value); draft.baseline = top + draft.fontSize; style(); };
  input.oninput=()=> {
    draft.text=input.value;
    const scale=surface.getBoundingClientRect().width/page.width;
    if(input.scrollHeight>input.clientHeight+2) { draft.height=Math.min(page.height-draft.baseline+draft.fontSize,Math.max(draft.height ?? 100,input.scrollHeight/scale)); layout(); }
  };
  function renderTable(): void {
    content.replaceChildren(); const grid = document.createElement("table"); grid.className = "hp-edit-grid";
    draft.table!.cells.forEach((row, r) => {
      const tr = document.createElement("tr"); row.forEach((value, c) => {
        const td = document.createElement("td"), cell = document.createElement("input"); cell.value = value; cell.setAttribute("aria-label", `${String.fromCharCode(65 + c)}${r + 1}`);
        cell.oninput = () => { draft.table!.cells[r][c] = cell.value; };
        cell.onkeydown = e => {
          let index = r * row.length + c;
          if (e.key === "Tab") index += e.shiftKey ? -1 : 1; else if (e.key === "Enter") index += e.shiftKey ? -row.length : row.length; else return;
          const next = grid.querySelectorAll<HTMLInputElement>("input")[index]; if (next) { e.preventDefault(); next.focus(); next.select(); }
        };
        cell.onpaste = e => {
          const text = e.clipboardData?.getData("text/plain"); if (!text || (!text.includes("\t") && !text.includes("\n"))) return;
          e.preventDefault(); text.trimEnd().split(/\r?\n/).slice(0, draft.table!.cells.length-r).forEach((line,dy) => line.split("\t").slice(0,row.length-c).forEach((v,dx) => { draft.table!.cells[r+dy][c+dx] = v; })); renderTable();
        };
        td.append(cell); tr.append(td);
      }); grid.append(tr);
    }); content.append(grid);
  }
  if (draft.table) {
    button("+ Zeile", () => { if (draft.table!.cells.length < 30) { draft.table!.cells.push(draft.table!.cells[0].map(() => "")); renderTable(); } });
    button("+ Spalte", () => { if (draft.table!.cells[0].length < 12) { draft.table!.cells.forEach(row => row.push("")); renderTable(); } }); renderTable();
  } else content.append(input);
  function drag(target: HTMLElement, corner: string): void {
    target.onpointerdown = e => {
      if(e.button!==0) return;
      e.preventDefault(); target.setPointerCapture(e.pointerId);
      const sx=e.clientX, sy=e.clientY, x=draft.x, top=draft.baseline-draft.fontSize, w=draft.width, h=draft.height ?? 230;
      target.onpointermove = move => {
        const scale=surface.getBoundingClientRect().width/page.width, dx=(move.clientX-sx)/scale, dy=(move.clientY-sy)/scale;
        if (corner) {
          const next=resizeNotebookBox({x,y:top,width:w,height:h},corner,dx,dy,page);
          draft.width=next.width; draft.height=next.height; draft.x=next.x; draft.baseline=next.y+draft.fontSize;
        }
        else { draft.x=Math.max(0,Math.min(page.width-draft.width,x+dx)); draft.baseline=Math.max(0,Math.min(page.height-(draft.height ?? 230),top+dy))+draft.fontSize; } layout();
      };
      target.onpointerup=target.onpointercancel=() => { target.onpointermove=null; if(target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId); };
    };
  }
  drag(move,"");
  for(const [corner,label] of [["nw","oben links"],["ne","oben rechts"],["sw","unten links"],["se","unten rechts"]]) {
    const handle=document.createElement("button"); handle.type="button"; handle.className=`hp-object-resize hp-resize-${corner}`; handle.setAttribute("aria-label",`Größe ziehen ${label}`); box.append(handle); drag(handle,corner);
  }
  const observer=new ResizeObserver(layout); observer.observe(surface); layout();
  return new Promise(resolve => {
    let finished=false;
    const finish=(value:TextElement|null) => { if(finished) return; finished=true; observer.disconnect(); document.removeEventListener("pointerdown",outside,true); signal?.removeEventListener("abort",abort); box.remove(); resolve(value); };
    // Systemabbruch (z. B. Fenster zu, Seitenwechsel): begonnene Arbeit nicht wegwerfen,
// sondern dem Aufrufer zur Rettung übergeben. Bewusstes Abbrechen (× / Escape) bleibt
// Verwerfen — dort hat der Nutzer die Absicht erklärt (Paritäts-Audit, Blocker A4).
  const abort=()=>{ const hatInhalt=!!draft.text.trim()||!!draft.table&&draft.table.cells.some(r=>r.some(c=>String(c??"").trim())); if(hatInhalt) onAbandoned?.(structuredClone(draft)); finish(null); };
    const commit=() => {
      if(draft.table) draft.text=draft.table.cells.map(row=>row.join("\t")).join("\n");
      if(draft.table) {
        const ctx=document.createElement("canvas").getContext("2d")!; ctx.font=`${draft.fontStyle ?? "normal"} ${draft.fontWeight ?? 400} ${draft.fontSize}px Arial`;
        const rowHeight=(draft.height ?? 230)/draft.table.cells.length, width=draft.width/draft.table.cells[0].length-16;
        if(draft.table.cells.some(row=>row.some(value=>wrapTextLines(value,width,"body",line=>ctx.measureText(line).width).length*draft.fontSize*1.25+8>rowHeight))) { status.textContent="Tabelle höher oder breiter ziehen, damit der Zelltext hineinpasst."; return; }
      }
      if(!draft.table && !draft.text.trim()) { if(!original) finish(null); else status.textContent="Text darf nicht leer sein. Abbrechen erhält das Original."; return; }
      if(!draft.table && input.scrollHeight>input.clientHeight+2) { status.textContent="Textfeld höher ziehen, damit der gesamte Text hineinpasst."; return; }
      finish(draft);
    };
    const outside=(e:PointerEvent) => { if(e.target instanceof Node && !box.contains(e.target)) { e.preventDefault(); e.stopPropagation(); commit(); } };
    button("Abbrechen",()=>finish(null),"×"); button("Übernehmen",commit,"✓");
    document.addEventListener("pointerdown",outside,true);
    signal?.addEventListener("abort",abort,{once:true}); if(signal?.aborted) { finish(null); return; }
    box.onkeydown=e=> { if(e.key==="Escape") { e.stopPropagation(); finish(null); } else if((e.ctrlKey||e.metaKey)&&e.key==="Enter") {e.preventDefault();e.stopPropagation();commit();} };
    (content.querySelector("input,textarea") as HTMLElement)?.focus(); box.scrollIntoView({block:"nearest"});
  });
}
