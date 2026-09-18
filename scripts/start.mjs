import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
function run(script,args=[]){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[script,...args],{stdio:"inherit",windowsHide:true});for(const sig of ["SIGINT","SIGTERM"])process.once(sig,()=>child.kill(sig));child.on("error",reject);child.on("exit",code=>code===0?resolve():reject(new Error(`Process exited ${code}`)));});}
await run(fileURLToPath(new URL("./db-init.mjs",import.meta.url)));
await run(fileURLToPath(new URL("../node_modules/next/dist/bin/next",import.meta.url)),["start","-p",process.env.PORT||"3000"]);
