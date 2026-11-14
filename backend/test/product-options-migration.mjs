import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Disposable PostgreSQL engine: never connects to DATABASE_URL or production.
const db = new PGlite();
const migrationDir = new URL('../prisma/migrations/', import.meta.url);
const migration = '20261029000000_product_options';
try {
  const names = (await readdir(migrationDir, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort();
  for (const name of names.filter(n => n < migration)) await db.exec(await readFile(new URL(`${name}/migration.sql`, migrationDir), 'utf8'));
  const brand = '00000000-0000-4000-8000-000000000001';
  const branch = '00000000-0000-4000-8000-000000000002';
  const product = '00000000-0000-4000-8000-000000000003';
  const option = '00000000-0000-4000-8000-000000000004';
  await db.query('INSERT INTO brands(id,name,slug,updated_at) VALUES($1,$2,$3,now())', [brand, 'Brand', 'brand']);
  await db.query('INSERT INTO branches(id,name,updated_at) VALUES($1,$2,now())', [branch, 'Shop']);
  await db.query('INSERT INTO products(id,name,slug,brand_id,selling_price,cost_price,updated_at) VALUES($1,$2,$3,$4,500,200,now())', [product, 'Device', 'device', brand]);
  await db.query('INSERT INTO inventory(id,product_id,branch_id,quantity,selling_price,updated_at) VALUES(gen_random_uuid(),$1,$2,10,550,now())', [product, branch]);
  const before = (await db.query('SELECT * FROM inventory')).rows;
  await db.exec(await readFile(new URL(`${migration}/migration.sql`, migrationDir), 'utf8'));
  assert.deepEqual((await db.query('SELECT * FROM inventory')).rows, before, 'migration preserves existing stock and branch prices');
  assert.equal((await db.query('SELECT variant_type FROM products WHERE id=$1', [product])).rows[0].variant_type, 'NONE');
  await db.query("UPDATE products SET variant_type='COLOR' WHERE id=$1", [product]);
  await db.query("INSERT INTO products(id,name,slug,brand_id,parent_id,option_name,selling_price,updated_at) VALUES($1,'Device — Black','device-black',$2,$3,'Black',500,now())", [option, brand, product]);
  await assert.rejects(db.query("INSERT INTO products(id,name,slug,brand_id,parent_id,option_name,updated_at) VALUES(gen_random_uuid(),'duplicate','duplicate',$1,$2,' black ',now())", [brand, product]), /duplicate key/);
  await assert.rejects(db.query("UPDATE products SET variant_type='FLAVOR' WHERE id=$1", [option]), /check constraint/);
  await assert.rejects(db.query('DELETE FROM products WHERE id=$1', [product]), /foreign key/);
  // Roll back both halves of an allocation if an operation fails.
  await db.exec('BEGIN');
  await db.query('UPDATE inventory SET quantity=0 WHERE product_id=$1', [product]);
  await db.query('INSERT INTO inventory(id,product_id,branch_id,quantity,updated_at) VALUES(gen_random_uuid(),$1,$2,10,now())', [option, branch]);
  await db.exec('ROLLBACK');
  assert.equal((await db.query('SELECT quantity FROM inventory WHERE product_id=$1', [product])).rows[0].quantity, 10);
  assert.equal((await db.query('SELECT * FROM inventory WHERE product_id=$1', [option])).rows.length, 0);
  // The existing conditional reservation SQL also protects each individual option.
  await db.query('INSERT INTO inventory(id,product_id,branch_id,quantity,updated_at) VALUES(gen_random_uuid(),$1,$2,1,now())', [option, branch]);
  const reserve = () => db.query('UPDATE inventory SET quantity=quantity-1 WHERE product_id=$1 AND branch_id=$2 AND quantity>=1 RETURNING quantity', [option, branch]);
  const results = await Promise.all([reserve(), reserve()]);
  assert.equal(results.reduce((n, r) => n + r.rows.length, 0), 1, 'only one reservation can consume the last unit');
  assert.equal((await db.query('SELECT quantity FROM inventory WHERE product_id=$1', [product])).rows[0].quantity, 10, 'reserving an option does not touch legacy parent stock');
  // Branch and global archives hide stock independently while retaining quantity.
  await db.query('UPDATE inventory SET quantity=9, archived_at=now() WHERE product_id=$1', [option]);
  const reserveActive = () => db.query('UPDATE inventory SET quantity=quantity-1 WHERE product_id=$1 AND branch_id=$2 AND quantity>=1 AND archived_at IS NULL AND EXISTS (SELECT 1 FROM products p WHERE p.id=inventory.product_id AND p.deleted_at IS NULL) RETURNING quantity', [option, branch]);
  assert.equal((await reserveActive()).rows.length, 0);
  await db.query('UPDATE products SET deleted_at=now() WHERE id=$1', [option]);
  await db.query('UPDATE products SET deleted_at=NULL WHERE id=$1', [option]);
  assert.equal((await reserveActive()).rows.length, 0, 'global restore preserves branch archive');
  assert.equal((await db.query('SELECT quantity FROM inventory WHERE product_id=$1', [option])).rows[0].quantity, 9);
  await db.query('UPDATE inventory SET archived_at=NULL WHERE product_id=$1', [option]);
  await db.query('UPDATE products SET deleted_at=now() WHERE id=$1', [option]);
  assert.equal((await reserveActive()).rows.length, 0, 'global archive blocks reservation');
  await db.query('UPDATE products SET deleted_at=NULL WHERE id=$1', [option]);
  assert.equal((await reserveActive()).rows[0].quantity, 8, 'restored stock can be reserved');
  console.log('PASS: migrations, stock preservation, constraints, rollback, last-unit reservation, independent archive scopes, retained quantities, and restored availability.');
} finally { await db.close(); }
