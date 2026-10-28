-- Replace the single "BankTransfer" payment method with the two concrete banks
-- the shop accepts: "BPI" and "BDO".
--
-- Shape change for Split payments: the paymentSplit JSON used a single
-- `bankTransfer` bucket; it now uses two buckets `bpi` and `bdo`.
--
-- This migration is written to be SAFE even if legacy data existed (the shop
-- is still being built and has no sales yet, but we migrate defensively):
--   1. Reassign any Sale/SaleItem rollup paymentMethod = 'BankTransfer' -> 'BDO'.
--   2. Fold any nonzero paymentSplit.bankTransfer amount into a new `bdo` bucket
--      and drop the `bankTransfer` key (totals unchanged — the money was always
--      counted; it just moves from the generic bank bucket to BDO), and ensure
--      a `bpi` key exists (0) for shape consistency.
--   3. Recreate the payment_method enum as Cash, Gcash, BPI, BDO, Split, Mixed.

-- 1. Reassign any rollup/item that was BankTransfer -> BDO.
UPDATE "sales" SET "payment_method" = 'BDO' WHERE "payment_method" = 'BankTransfer';
UPDATE "sale_items" SET "payment_method" = 'BDO' WHERE "payment_method" = 'BankTransfer';

-- 2. Migrate Split breakdowns: move bankTransfer -> bdo, add bpi = 0.
UPDATE "sale_items"
SET "payment_split" =
  (("payment_split" - 'bankTransfer')
    || jsonb_build_object(
         'bdo',
         COALESCE(("payment_split"->>'bdo')::numeric, 0)
           + COALESCE(("payment_split"->>'bankTransfer')::numeric, 0),
         'bpi',
         COALESCE(("payment_split"->>'bpi')::numeric, 0)
       ))
WHERE "payment_split" IS NOT NULL
  AND "payment_split" ? 'bankTransfer';

-- 3. Recreate the enum with BPI + BDO instead of BankTransfer.
--    (Postgres can't add/drop a value cleanly mid-list, so swap the type.)
ALTER TYPE "payment_method" RENAME TO "payment_method_old";

CREATE TYPE "payment_method" AS ENUM ('Cash', 'Gcash', 'BPI', 'BDO', 'Split', 'Mixed');

-- Drop the column defaults before the type swap, then restore them after.
ALTER TABLE "sales" ALTER COLUMN "payment_method" DROP DEFAULT;
ALTER TABLE "sale_items" ALTER COLUMN "payment_method" DROP DEFAULT;

ALTER TABLE "sales"
  ALTER COLUMN "payment_method" TYPE "payment_method"
  USING ("payment_method"::text::"payment_method");
ALTER TABLE "sale_items"
  ALTER COLUMN "payment_method" TYPE "payment_method"
  USING ("payment_method"::text::"payment_method");

ALTER TABLE "sales" ALTER COLUMN "payment_method" SET DEFAULT 'Cash';
ALTER TABLE "sale_items" ALTER COLUMN "payment_method" SET DEFAULT 'Cash';

DROP TYPE "payment_method_old";
