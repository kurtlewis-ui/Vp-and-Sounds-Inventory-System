const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const filename = path.resolve(__dirname, '../src/common/utils/sale-aggregate.util.ts');
const loaded = new Module(filename, module);
loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { paymentSummarySql, saleAggregatePredicate } = loaded.exports;
const extra = fs.readFileSync(filename, 'utf8').includes("'BDO'") ? ['bdo','bpi'] : ['bankTransfer','maya'];
const branch='11111111-1111-4111-8111-111111111111';
(async()=>{const db=new PGlite();try{
await db.exec(`CREATE TYPE sale_status AS ENUM ('APPROVED','PENDING','DECLINED');
CREATE TABLE users(id uuid,first_name text,last_name text);
CREATE TABLE sales(id uuid,branch_id uuid,staff_id uuid,status sale_status,created_at timestamp,decided_at timestamp,customer_name text);
CREATE TABLE sale_items(id uuid,sale_id uuid,name text,brand_name text,quantity int,unit_price numeric,cost_price numeric,discount numeric,sub_total numeric,payment_method text,payment_split jsonb);
INSERT INTO users VALUES ('22222222-2222-4222-8222-222222222222','Sample','Staff');
INSERT INTO sales SELECT md5(n::text)::uuid, CASE WHEN n=4 THEN '33333333-3333-4333-8333-333333333333'::uuid ELSE '${branch}'::uuid END,'22222222-2222-4222-8222-222222222222', CASE WHEN n=3 THEN 'PENDING'::sale_status ELSE 'APPROVED'::sale_status END, CASE WHEN n=2 THEN '2026-11-17 15:00'::timestamp ELSE '2026-11-18 02:00'::timestamp END, '2026-11-18 03:00','Customer' FROM generate_series(1,4)n;
INSERT INTO sale_items SELECT md5((n*10+k)::text)::uuid,md5(n::text)::uuid,CASE WHEN k=1 THEN 'Literal %_ Product' WHEN k=2 THEN 'GCash Product' ELSE 'Split Product' END,'Brand',CASE WHEN k=1 THEN 2 ELSE 1 END,CASE WHEN k=2 THEN 200 WHEN k=1 THEN 55 ELSE 100 END,40,CASE WHEN k=1 THEN 10 ELSE 0 END,CASE WHEN k=2 THEN 200 ELSE 100 END,CASE WHEN k=1 THEN 'Cash' WHEN k=2 THEN 'Gcash' ELSE 'Split' END,CASE WHEN k=3 THEN '{"cash":10,"gcash":20,"${extra[0]}":30,"${extra[1]}":40}'::jsonb ELSE null END FROM generate_series(1,4)n,generate_series(1,3)k;`);
async function run(scope){const sql=paymentSummarySql(saleAggregatePredicate(scope));const {rows}=await db.query(sql.text,sql.values);return Object.fromEntries(Object.entries(rows[0]).map(([k,v])=>[k,Number(v)]));}
const scope={status:'APPROVED',branchId:branch,dateRange:{gte:new Date('2026-11-17T16:00Z'),lt:new Date('2026-11-18T16:00Z')}};
assert.deepEqual(await run(scope),{quantity:4,grossSales:410,discount:10,cash:110,gcash:220,[extra[0]]:30,[extra[1]]:40});
assert.equal((await run({...scope,search:'samp'})).grossSales,410);
assert.equal((await run({...scope,search:'Customer'})).grossSales,410);
assert.equal((await run({...scope,search:'Split'})).grossSales,410,'legacy sale-level search includes the entire matching transaction');
assert.equal((await run({...scope,branchId:undefined})).grossSales,820);
assert.equal((await run({status:'PENDING',branchId:branch})).grossSales,410);
assert.equal((await run({status:'APPROVED',branchId:branch,decidedRange:{gte:new Date('2026-11-18T00:00Z')}})).grossSales,820);
assert.equal((await run({...scope,search:"' OR 1=1 --"})).grossSales,0);
const costSql=require('@prisma/client').Prisma.sql`SELECT COALESCE(SUM(i.cost_price*i.quantity),0) AS capital FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE ${saleAggregatePredicate(scope)}`;
assert.equal(Number((await db.query(costSql.text,costSql.values)).rows[0].capital),160);
for (const [n, method] of extra.map((key, n) => [n, ({bdo:'BDO', bpi:'BPI', bankTransfer:'BankTransfer', maya:'Maya'})[key]])) {
  await db.query(`INSERT INTO sale_items VALUES (md5($1)::uuid,md5('1')::uuid,'Standalone method','Brand',1,50,20,0,50,$2,null)`, ['standalone'+n,method]);
}
const standalone = await run(scope);
assert.equal(standalone[extra[0]],80);assert.equal(standalone[extra[1]],90);assert.equal(standalone.grossSales,510);
console.log('PASS: PostgreSQL payment aggregates, split buckets, discounts, branch/date/status/approval scope, legacy sale-level search, empty/injection input, saved cost');
}finally{await db.close()}})().catch(e=>{console.error(e);process.exitCode=1});
