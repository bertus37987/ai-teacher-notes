import assert from "node:assert/strict";
import {resizeNotebookImage,waitForNotebookImage} from "../src/notebook-image";
import {createDocument,parseDocument,ImageElement,cloneDocument} from "../src/document";
const page={width:1200,height:1697},box={x:100,y:150,width:400,height:200};
for(const corner of ["nw","ne","sw","se"])for(const dx of [-2000,-50,50,2000])for(const dy of [-2000,-50,50,2000]) {
  const next=resizeNotebookImage(box,corner,dx,dy,page);
  assert.ok(next.x>=0&&next.y>=0&&next.x+next.width<=page.width+.001&&next.y+next.height<=page.height+.001);
  assert.ok(Math.abs(next.width/next.height-2)<.001,"photo aspect ratio must stay intact");
  assert.ok(next.width>0&&next.height>0);
  assert.equal(corner.includes("w")?next.x+next.width:next.x,corner.includes("w")?box.x+box.width:box.x,"opposite X corner fixed");
  assert.equal(corner.includes("n")?next.y+next.height:next.y,corner.includes("n")?box.y+box.height:box.y,"opposite Y corner fixed");
}
const doc=createDocument("grid"),image:ImageElement={...box,id:"photo",type:"image",dataUrl:"data:image/png;base64,dGVzdA==",mimeType:"image/png",sourceName:"Bild.png"};
doc.pages[0].elements=[image,{type:"stroke",id:"ink",color:"#111",size:3,points:[{x:120,y:180,pressure:.5}]}];
const backup=cloneDocument(doc);
Object.assign(image,resizeNotebookImage(image,"se",80,40,page));
assert.deepEqual(doc.pages[0].elements[1],backup.pages[0].elements[1],"image edits leave handwriting alone");
assert.equal(parseDocument(JSON.parse(JSON.stringify(doc)))!.document.pages[0].elements[0].type,"image");
doc.pages[0].elements=doc.pages[0].elements.filter(e=>e.id!=="photo");
assert.equal(doc.pages[0].elements[0].id,"ink","removing an image never removes ink");
async function main(){
  await waitForNotebookImage({complete:true,naturalWidth:20} as HTMLImageElement);
  await assert.rejects(waitForNotebookImage({complete:true,naturalWidth:0} as HTMLImageElement),/geladen/);
  const pending=Object.assign(new EventTarget(),{complete:false,naturalWidth:0}) as unknown as HTMLImageElement;
  const failed=waitForNotebookImage(pending);pending.dispatchEvent(new Event("error"));await assert.rejects(failed,/exportiert/);
  console.log("Image aspect ratio, corner bounds, persistence, independent ink and failed-image export tests passed");
}
void main();
