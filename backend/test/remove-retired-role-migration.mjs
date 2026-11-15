import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
// Disposable SQL engine only; never reads DATABASE_URL or production records.
const folder = new URL('../prisma/migrations/', import.meta.url);
const target = '20261115000000_remove_viewer_role';
const sql = await readFile(new URL(`${target}/migration.sql`, folder), 'utf8');
const db = new PGlite();
try {
  for (const name of (await readdir(folder)).filter(name => name < target).sort()) {
    if(name==='migration_lock.toml') continue;
    await db.exec(await readFile(new URL(`${name}/migration.sql`, folder), 'utf8'));
  }
  const staffRole='00000000-0000-4000-8000-000000000001', retiredRole='00000000-0000-4000-8000-000000000002', ownerRole='00000000-0000-4000-8000-000000000003';
  const retiredUser='00000000-0000-4000-8000-000000000011', ownerUser='00000000-0000-4000-8000-000000000012', branch='00000000-0000-4000-8000-000000000013';
  await db.query(`INSERT INTO roles(id,name,permissions,updated_at) VALUES ($1,'Staff','{"custom":true}',now()),($2,'Viewer','{}',now()),($3,'Owner','{}',now())`,[staffRole,retiredRole,ownerRole]);
  await db.query('INSERT INTO branches(id,name,updated_at) VALUES($1,\'Test Branch\',now())',[branch]);
  await db.query(`INSERT INTO users(id,email,password_hash,first_name,last_name,role_id,branch_id,updated_at) VALUES($1,'retired@example.invalid','hash','Retired','Account',$2,$3,now()),($4,'owner@example.invalid','hash','Owner','Account',$5,null,now())`,[retiredUser,retiredRole,branch,ownerUser,ownerRole]);
  await db.query(`INSERT INTO sessions(id,user_id,refresh_token_hash,expires_at) VALUES(gen_random_uuid(),$1,'retired-token',now()+interval '1 day'),(gen_random_uuid(),$2,'owner-token',now()+interval '1 day')`,[retiredUser,ownerUser]);
  await db.query(`INSERT INTO audit_logs(id,user_id,action,entity_type,entity_id,new_values) VALUES(gen_random_uuid(),$1,'SALE_CREATED','Sale',gen_random_uuid(),'{"quantity":3}')`,[retiredUser]);
  const ownerBefore=(await db.query('SELECT * FROM users WHERE id=$1',[ownerUser])).rows;
  const historyBefore=(await db.query('SELECT * FROM audit_logs')).rows;
  await db.exec(sql);
  assert.equal((await db.query("SELECT * FROM roles WHERE name='Viewer'")).rows.length,0);
  const retired=(await db.query('SELECT * FROM users WHERE id=$1',[retiredUser])).rows[0];
  assert.equal(retired.role_id,staffRole);assert.equal(retired.is_active,false);assert.equal(retired.branch_id,null);assert.equal(retired.must_change_password,true);
  assert.equal((await db.query('SELECT * FROM sessions WHERE user_id=$1',[retiredUser])).rows.length,0);
  assert.equal((await db.query('SELECT * FROM sessions WHERE user_id=$1',[ownerUser])).rows.length,1);
  assert.deepEqual((await db.query('SELECT * FROM users WHERE id=$1',[ownerUser])).rows,ownerBefore);
  assert.deepEqual((await db.query('SELECT * FROM audit_logs')).rows,historyBefore);
  assert.deepEqual((await db.query('SELECT permissions FROM roles WHERE id=$1',[staffRole])).rows[0].permissions,{custom:true});
  await db.exec(sql); // Also safe if a deployment retries the cleanup.
  assert.equal((await db.query('SELECT * FROM users')).rows.length,2);
  console.log('PASS: database role removed; retired users retained inactive without branch, sessions revoked, history and Owner unchanged; repeated cleanup safe.');
} finally { await db.close(); }
