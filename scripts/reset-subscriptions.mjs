import { spawn } from "node:child_process";
import { mkdir, stat, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import pg from "pg";
const connectionString=process.env.DATABASE_URL;
if(!connectionString)throw new Error("DATABASE_URL is required");
const pool=new pg.Pool({connectionString,max:1});
try {
  const counts=await pool.query(`SELECT count(*)::int AS subscriptions FROM subscriptions`);
  console.log("Subscriptions to remove:",counts.rows[0].subscriptions);
  if(!process.argv.includes("--execute")){
    console.log("Preview only. Stop the website and workers; then run npm run db:reset-subscriptions -- --execute. A full pg_dump backup is mandatory.");
  }else{
    const directory=resolve(process.env.DB_BACKUP_DIR||"backups");await mkdir(directory,{recursive:true});
    const file=join(directory,`before-reset-${new Date().toISOString().replace(/[:.]/g,"-")}.dump`);
    // Keep credentials out of command arguments. pg_dump must be installed on the host.
    const url=new URL(connectionString);
    const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||"5432",PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:decodeURIComponent(url.pathname.slice(1))};
    if(url.searchParams.has("sslmode"))env.PGSSLMODE=url.searchParams.get("sslmode");
    await new Promise((resolve,reject)=>{
      const child=spawn("pg_dump",["--format=custom","--file",file],{env,stdio:["ignore","ignore","inherit"],windowsHide:true});
      child.on("error",reject);child.on("exit",code=>code===0?resolve():reject(new Error(`Backup failed (${code}); nothing deleted`)));
    });
    if((await stat(file)).size<100)throw new Error("Backup is empty; nothing deleted");
    const digest=createHash("sha256").update(await readFile(file)).digest("hex");
    await writeFile(`${file}.sha256`,`${digest}  ${file}\n`,{flag:"wx",mode:0o600});
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      await client.query("LOCK TABLE subscriptions, subscription_days, subscription_scans IN ACCESS EXCLUSIVE MODE");
      await client.query("DELETE FROM manager_events WHERE entity_id IN (SELECT id FROM subscriptions)");
      await client.query("DELETE FROM subscription_scans");
      await client.query("UPDATE pickup_lock_states SET open_until=NULL,last_redeemed_subscription_id=NULL,last_redeemed_subscription_day_id=NULL");
      await client.query("DELETE FROM subscriptions");
      await client.query("DELETE FROM pickup_point_daily_inventory");
      await client.query("UPDATE app_runtime_settings SET test_mode=false,test_datetime_local=NULL,updated_at=now()");
      await client.query("COMMIT");console.log("Reset complete. Customer accounts and chats preserved. Backup:",file);
    }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  }
}finally{await pool.end();}
