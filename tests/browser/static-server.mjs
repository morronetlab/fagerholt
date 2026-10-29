import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('../../public/',import.meta.url)));
const contentTypes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
 '.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
export async function startStaticServer(){
 const server=createServer(async(req,res)=>{
  let target;
  try{
   const path=new URL(req.url,'http://127.0.0.1').pathname;
   target=resolve(root,'.'+decodeURIComponent(path==='/'?'/index.html':path));
  }catch{res.writeHead(400).end('Bad path');return;}
  if(target!==root&&!target.startsWith(root+sep)){res.writeHead(403).end('Forbidden');return;}
  try{
   const bytes=await readFile(target);
   res.writeHead(200,{'Content-Type':contentTypes[extname(target)]||'application/octet-stream','Cache-Control':'no-store'});
   res.end(bytes);
  }catch{res.writeHead(404).end('Not found');}
 });
 await new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(0,'127.0.0.1',resolve);
 });
 return {
  baseURL:'http://127.0.0.1:'+server.address().port,
  close:()=>new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()))
 };
}
