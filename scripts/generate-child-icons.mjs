/** Generate self-hosted PWA icons without an image CDN or native dependencies. */
import {deflateSync} from 'node:zlib';
import {writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const cwd=resolve(dirname(fileURLToPath(import.meta.url)),'../public/barn');
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
function withinRounded(x,y,left,top,right,bottom,radius){
 if(x<left||x>right||y<top||y>bottom)return false;
 const cx=x<left+radius?left+radius:x>right-radius?right-radius:x;
 const cy=y<top+radius?top+radius:y>bottom-radius?bottom-radius:y;
 return (x-cx)**2+(y-cy)**2<=radius*radius;
}
export function childIconPng(n){
 if(![192,512].includes(n))throw Error('Unsupported icon size');
 const scan=Buffer.alloc(n*(n*4+1)),ratio=n/512;
 const rect=(x,y,a,b,c,d,r=0)=>withinRounded(x,y,a*ratio,b*ratio,c*ratio,d*ratio,r*ratio);
 const colorAt=(x,y)=>{
  if(rect(x,y,95,77,417,435,50)){
   if(rect(x,y,129,142,383,186,16))return [94,170,133];
   if(rect(x,y,129,223,268,262,13)||rect(x,y,129,286,353,327,13))return [153,207,167];
   if((x-340*ratio)**2+(y-275*ratio)**2<=(35*ratio)**2)return [249,190,90];
   return [241,252,238];
  }
  return [29,102,80];
 };
 for(let y=0;y<n;y++){
  let offset=y*(n*4+1);scan[offset++]=0;
  for(let x=0;x<n;x++){
   const rgb=colorAt(x,y);scan[offset++]=rgb[0];scan[offset++]=rgb[1];
   scan[offset++]=rgb[2];scan[offset++]=255;
  }
 }
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(n,0);ihdr.writeUInt32BE(n,4);
 ihdr[8]=8;ihdr[9]=6; // 8-bit RGBA
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),
  chunk('IDAT',deflateSync(scan,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 mkdirSync(cwd,{recursive:true});
 for(const n of [192,512])writeFileSync(resolve(cwd,'icon-'+n+'.png'),childIconPng(n));
}
