import assert from "node:assert/strict";
import {resizeNotebookBox} from "../src/notebook-text";

const box={x:200,y:160,width:520,height:230},page={width:1200,height:1697};
assert.deepEqual(resizeNotebookBox(box,"se",80,40,page),{x:200,y:160,width:600,height:270});
assert.deepEqual(resizeNotebookBox(box,"nw",40,30,page),{x:240,y:190,width:480,height:200});
assert.deepEqual(resizeNotebookBox(box,"ne",80,30,page),{x:200,y:190,width:600,height:200});
assert.deepEqual(resizeNotebookBox(box,"sw",40,40,page),{x:240,y:160,width:480,height:270});
for(const corner of ["nw","ne","sw","se"]) for(const delta of [-5000,5000]) {
  const result=resizeNotebookBox(box,corner,delta,delta,page);
  assert.ok(result.x>=0 && result.y>=0 && result.width>=160 && result.height>=80);
  assert.ok(result.x+result.width<=page.width && result.y+result.height<=page.height);
}
assert.deepEqual(box,{x:200,y:160,width:520,height:230},"resizing does not mutate saved content");
console.log("Notebook object corner resizing and page bounds tests passed");
