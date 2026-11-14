-- Additive migration: all existing products retain their identity and stock.
ALTER TABLE "products" ADD COLUMN "variant_type" VARCHAR(10) NOT NULL DEFAULT 'NONE',
  ADD COLUMN "parent_id" UUID, ADD COLUMN "option_name" VARCHAR(60);
ALTER TABLE "products" ADD CONSTRAINT "products_variant_type_check"
  CHECK ("variant_type" IN ('NONE', 'FLAVOR', 'COLOR'));
ALTER TABLE "products" ADD CONSTRAINT "products_option_shape_check"
  CHECK (("parent_id" IS NULL AND "option_name" IS NULL) OR
         ("parent_id" IS NOT NULL AND "option_name" IS NOT NULL AND "variant_type" = 'NONE'));
ALTER TABLE "products" ADD CONSTRAINT "products_parent_id_fkey"
  FOREIGN KEY ("parent_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "products_parent_id_idx" ON "products"("parent_id");
CREATE UNIQUE INDEX "products_parent_id_option_name_key" ON "products"("parent_id", "option_name");
CREATE UNIQUE INDEX "products_option_name_normalized_key" ON "products"("parent_id", lower(trim("option_name"))) WHERE "parent_id" IS NOT NULL;
