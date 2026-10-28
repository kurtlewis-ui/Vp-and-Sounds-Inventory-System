-- Product Variants (flavors / colors)
--
-- Adds:
--   products.variant_type       -- 'none' | 'flavor' | 'color' (default 'none')
--   product_variants            -- one row per flavor/color of a product
--   variant_inventory           -- per-variant per-branch stock
--   sale_items.variant_id/name  -- which variant was sold (+ snapshot)
--   disposals.variant_id/name   -- which variant was disposed (+ snapshot)
--   stock_movements.variant_id  -- which variant a stock change was for
--
-- Prices stay PRODUCT-LEVEL (every variant shares the product's price); only
-- STOCK is tracked per variant per branch. Safe on an empty catalog.
--
-- NOTE: ids have no DB default — Prisma supplies the UUID from the app layer
-- (@default(uuid())), matching every other table in this schema. Timestamps
-- use CURRENT_TIMESTAMP to match the existing migrations.

-- products.variant_type
ALTER TABLE "products"
  ADD COLUMN "variant_type" VARCHAR(10) NOT NULL DEFAULT 'none';

-- product_variants
CREATE TABLE "product_variants" (
  "id"         UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "name"       VARCHAR(100) NOT NULL,
  "is_active"  BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL,
  "deleted_at" TIMESTAMP(6),
  CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "product_variants_product_id_idx" ON "product_variants"("product_id");
CREATE INDEX "product_variants_is_active_idx" ON "product_variants"("is_active");
ALTER TABLE "product_variants"
  ADD CONSTRAINT "product_variants_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- variant_inventory
CREATE TABLE "variant_inventory" (
  "id"         UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "variant_id" UUID NOT NULL,
  "branch_id"  UUID NOT NULL,
  "quantity"   INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(6) NOT NULL,
  CONSTRAINT "variant_inventory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "variant_inventory_variant_id_branch_id_key" ON "variant_inventory"("variant_id", "branch_id");
CREATE INDEX "variant_inventory_branch_id_idx" ON "variant_inventory"("branch_id");
CREATE INDEX "variant_inventory_product_id_idx" ON "variant_inventory"("product_id");
ALTER TABLE "variant_inventory"
  ADD CONSTRAINT "variant_inventory_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "variant_inventory"
  ADD CONSTRAINT "variant_inventory_variant_id_fkey"
  FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "variant_inventory"
  ADD CONSTRAINT "variant_inventory_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- sale_items variant columns
ALTER TABLE "sale_items" ADD COLUMN "variant_id"   UUID;
ALTER TABLE "sale_items" ADD COLUMN "variant_name" VARCHAR(100);
CREATE INDEX "sale_items_variant_id_idx" ON "sale_items"("variant_id");
ALTER TABLE "sale_items"
  ADD CONSTRAINT "sale_items_variant_id_fkey"
  FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- disposals variant columns
ALTER TABLE "disposals" ADD COLUMN "variant_id"   UUID;
ALTER TABLE "disposals" ADD COLUMN "variant_name" VARCHAR(100);
CREATE INDEX "disposals_variant_id_idx" ON "disposals"("variant_id");
ALTER TABLE "disposals"
  ADD CONSTRAINT "disposals_variant_id_fkey"
  FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- stock_movements variant column
ALTER TABLE "stock_movements" ADD COLUMN "variant_id" UUID;
CREATE INDEX "stock_movements_variant_id_idx" ON "stock_movements"("variant_id");
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_variant_id_fkey"
  FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
