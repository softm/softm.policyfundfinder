import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
export function d1(){
  const db=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../../drizzle/'+file,import.meta.url),'utf8').replaceAll('--> statement-breakpoint',''));
  const prepare=(sql,args=[])=>({bind(...a){return prepare(sql,a)},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}}}});
  return {prepare,async batch(stmts){db.exec('BEGIN');try{const result=[];for(const s of stmts)result.push(await s.run());db.exec('COMMIT');return result;}catch(err){db.exec('ROLLBACK');throw err;}},close(){db.close()}};
}