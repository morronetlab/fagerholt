/** Rasterize the Skoleuka book/planner mark for both installable PWAs.
 * The geometry and palette mirror public/brand/skoleuka-icon.svg.
 * Generated PNGs are build artifacts (npm pretest / Netlify build), not committed.
 * Keep writing /barn/icon-*.png for older installed child clients. */
import {deflateSync} from 'node:zlib';
import {writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const publicRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../public');
const crcTable=Array.from({length:256},(_,i)=>{
 let c=i;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;
 return c>>>0;
});
const crc=bytes=>{
 let n=0xffffffff;for(const b of bytes)n=crcTable[(n^b)&255]^(n>>>8);
 return (n^0xffffffff)>>>0;
};
const chunk=(type,bytes)=>{
 const name=Buffer.from(type),len=Buffer.alloc(4),sum=Buffer.alloc(4);
 len.writeUInt32BE(bytes.length);sum.writeUInt32BE(crc(Buffer.concat([name,bytes])));
 return Buffer.concat([len,name,bytes,sum]);
};
const left=[[100,175],[144,163],[198,164],[251,185],[251,370],[204,348],[148,344],[100,356]];
const right=[[261,185],[314,164],[368,163],[412,175],[412,356],[364,344],[308,348],[261,370]];
function rounded(x,y,left,top,right,bottom,radius){
 if(x<left||x>right||y<top||y>bottom)return false;
 const cx=x<left+radius?left+radius:x>right-radius?right-radius:x;
 const cy=y<top+radius?top+radius:y>bottom-radius?bottom-radius:y;
 return (x-cx)**2+(y-cy)**2<=radius*radius;
}
function polygon(x,y,points){
 let inside=false;
 for(let i=0,j=points.length-1;i<points.length;j=i++){
  const [a,b]=points[i],[c,d]=points[j];
  if(((b>y)!==(d>y))&&(x<(c-a)*(y-b)/(d-b)+a))inside=!inside;
 }
 return inside;
}
function horizontalStroke(x,y,left,right,top,width=13){
 const tx=Math.min(right,Math.max(left,x));
 return (x-tx)**2+(y-top)**2<=(width/2)**2;
}
export function skoleukaIconPng(n){
 if(![192,512].includes(n))throw Error('Unsupported icon size');
 const scan=Buffer.alloc(n*(n*4+1)),ratio=512/n;
 const colorAt=(x,y)=>{
  // Sample at the pixel centre in the same 512×512 coordinate system as the SVG.
  x=(x+.5)*ratio;y=(y+.5)*ratio;
  if(!rounded(x,y,0,0,512,512,112))return [0,0,0,0];
  if(polygon(x,y,left)){
   if(horizontalStroke(x,y,136,201,218)||horizontalStroke(x,y,136,209,259)||
      horizontalStroke(x,y,136,193,300))return [87,141,116,255];
   return [255,248,239,255];
  }
  if(polygon(x,y,right)){
   if(horizontalStroke(x,y,303,374,218)||horizontalStroke(x,y,303,371,259)||
      horizontalStroke(x,y,303,355,300))return [87,141,116,255];
   return [215,241,223,255];
  }
  if((x-379)**2+(y-126)**2<=27**2)return [255,199,109,255];
  return [29,92,75,255];
 };
 for(let y=0;y<n;y++){
  let offset=y*(n*4+1);scan[offset++]=0;
  for(let x=0;x<n;x++){
   const rgba=colorAt(x,y);
   for(const channel of rgba)scan[offset++]=channel;
  }
 }
 const ihdr=Buffer.alloc(13);
 ihdr.writeUInt32BE(n,0);ihdr.writeUInt32BE(n,4);
 ihdr[8]=8;ihdr[9]=6; // PNG RGBA, 8-bit channels
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),
  chunk('IDAT',deflateSync(scan,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
// Preserve the existing public helper for tests and older installer paths.
export const childIconPng=skoleukaIconPng;
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const brandDir=resolve(publicRoot,'brand'),legacyDir=resolve(publicRoot,'barn');
 mkdirSync(brandDir,{recursive:true});mkdirSync(legacyDir,{recursive:true});
 for(const n of [192,512]){
  const bytes=skoleukaIconPng(n);
  writeFileSync(resolve(brandDir,'skoleuka-'+n+'.png'),bytes);
  writeFileSync(resolve(legacyDir,'icon-'+n+'.png'),bytes);
 }
}
