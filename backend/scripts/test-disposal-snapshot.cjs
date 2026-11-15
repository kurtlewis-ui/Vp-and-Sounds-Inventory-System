const { PGlite } = require('@electric-sql/pglite');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE products (id text PRIMARY KEY, parent_id text, selling_price numeric);
      CREATE TABLE inventory (product_id text, branch_id text, selling_price numeric);
      CREATE TABLE disposals (id text PRIMARY KEY, product_id text, branch_id text, quantity int, unit_price numeric, value numeric);
      INSERT INTO products VALUES ('plain',null,250),('parent',null,300),('option','parent',300),('fallback',null,150);
      INSERT INTO inventory VALUES ('plain','a',275),('parent','a',350);
      INSERT INTO disposals VALUES ('branch','plain','a',2,100,200),('option','option','a',3,100,300),('default','fallback','b',2,50,100),('missing',null,'a',1,80,80);
    `);
    await db.exec(readFileSync(resolve(__dirname, '../prisma/migrations/20261116000000_disposal_selling_snapshot/migration.sql'), 'utf8'));
    const result = await db.query('SELECT id, selling_value, value FROM disposals ORDER BY id');
    assert.deepEqual(result.rows.map(r => [r.id, Number(r.selling_value), Number(r.value)]), [
      ['branch',550,200],['default',300,100],['missing',0,80],['option',1050,300],
    ]);
    await db.exec('UPDATE products SET selling_price=999; UPDATE inventory SET selling_price=999;');
    assert.equal(Number((await db.query("SELECT selling_value FROM disposals WHERE id='branch'")).rows[0].selling_value), 550);
    console.log('PASS: selling snapshot migration, retained cost/records, parent and branch prices, deleted product fallback, frozen history');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
