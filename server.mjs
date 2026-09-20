import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||4173);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.woff2':'font/woff2','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8'};
const server=createServer(async(req,res)=>{
  try{
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const target=path.resolve(root,'.'+(name==='/'?'/index.html':name));
    const rel=path.relative(root,target);
    if(rel.startsWith('..')||path.isAbsolute(rel)||rel.split(/[\\/]/).some(x=>x.startsWith('.'))||!['index.html','src','vendor','examples'].includes(rel.split(/[\\/]/)[0])){
      res.writeHead(404);res.end('Não encontrado');return;
    }
    const data=await readFile(target);
    res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(data);
  }catch{res.writeHead(404);res.end('Não encontrado');}
});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`Porta ${port} ocupada. Defina PORT para usar outra porta.`:e.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`DUIMP Hub: http://127.0.0.1:${port}`));
