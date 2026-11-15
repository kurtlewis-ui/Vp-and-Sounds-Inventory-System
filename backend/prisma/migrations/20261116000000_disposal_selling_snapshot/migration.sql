-- Keep cost snapshots for Owner financials and a separate selling snapshot for Admin/Staff.
ALTER TABLE "disposals" ADD COLUMN "selling_value" DECIMAL(12,2) NOT NULL DEFAULT 0;
-- Historical selling prices were not stored. Freeze the best available branch/product
-- price at migration time; unavailable/deleted products get 0. Cost history is untouched.
UPDATE "disposals" AS d SET "selling_value" = COALESCE((
  SELECT COALESCE(pi.selling_price, i.selling_price, parent.selling_price, p.selling_price, 0) * d.quantity
  FROM products p
  LEFT JOIN products parent ON parent.id = p.parent_id
  LEFT JOIN inventory i ON i.product_id = p.id AND i.branch_id = d.branch_id
  LEFT JOIN inventory pi ON pi.product_id = parent.id AND pi.branch_id = d.branch_id
  WHERE p.id = d.product_id
), 0);
