// Generates a local, non-personal bitmap for the image import/export smoke test.
import {createRequire} from "node:module";
import {mkdir,writeFile} from "node:fs/promises";
const require=createRequire(import.meta.url);
const {createCanvas}=require(process.env.IMAGE_TEST_CANVAS_MODULE ?? "@napi-rs/canvas");
const canvas=createCanvas(640,360),c=canvas.getContext("2d");
c.fillStyle="#eff3fb";c.fillRect(0,0,640,360);
c.fillStyle="#7652b0";c.fillRect(0,0,640,70);
c.fillStyle="#fff";c.font="bold 28px sans-serif";c.fillText("BILDIMPORT / PDF TEST",28,46);
c.strokeStyle="#213047";c.lineWidth=4;c.strokeRect(30,100,200,220);
c.fillStyle="#ffc959";c.fillRect(300,115,275,75);
c.fillStyle="#203047";c.font="24px sans-serif";c.fillText("Hier beschriften",320,162);
c.fillStyle="#7ac3b3";c.beginPath();c.arc(420,265,60,0,Math.PI*2);c.fill();
await mkdir("tmp/pdfs",{recursive:true});
await writeFile("tmp/pdfs/image-import-fixture.png",canvas.toBuffer("image/png"));
console.log("tmp/pdfs/image-import-fixture.png");
