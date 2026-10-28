-- Replace the single "BankTransfer" payment method with the two concrete banks
-- the shop accepts: "BPI" and "BDO".
--
-- Shape change for Split payments: the paymentSplit JSON used a single
-- `bankTransfer` bucket; it now uses two buckets `bpi` and `bdo`.
--
-- ORDER MATTERS: we must recreate the enum (adding BPI/BDO) BEFORE updating any
-- rows to 'BDO' — otherwise 'BDO' isn't a valid enum value yet and the UPDATE
-- fails with "invalid input value for enum". So the steps are:
--   1. Recreate the payment_method enum as Cash, Gcash, BPI, BDO, Split, Mixed.
--   2. Reassign any Sale/SaleItem rollup paymentMethod = 'BankTransfer' -> 'BDO'
--      (BankTransfer no longer exists in the new enum, so leftover rows would
--      otherwise be invalid). Done as text so it works regardless of enum state.
--   3. Fold any paymentSplit.bankTransfer amount into a `bdo` bucket (+ bpi=0).
-- Safe even with no existing data (the shop is still being built).

-- ----------------------------------------------------------------------------
-- 1. Recreate the enum WITHOUT BankTransfer, WITH BPI + BDO.
--    Any existing 'BankTransfer' rows are mapped to 'BDO' inline during the
--    type swap via the USING expression, so no row is ever invalid.
-- ----------------------------------------------------------------------------
ALTER TYPE "payment_method" RENAME TO "payment_method_old";

CREATE TYPE "payment_method" AS ENUM ('Cash', 'Gcash', 'BPI', 'BDO', 'Split', 'Mixed');

-- Drop the column defaults before the type swap, then restore them after.
ALTER TABLE "sales" ALTER COLUMN "payment_method" DROP DEFAULT;
ALTER TABLE "sale_items" ALTER COLUMN "payment_method" DROP DEFAULT;

-- Swap the type. The USING expression maps the old text value to the new enum,
-- rewriting any legacy 'BankTransfer' to 'BDO' on the way (CASE handles it so
-- the cast never sees the now-removed 'BankTransfer' value).
ALTER TABLE "sales"
  ALTER COLUMN "payment_method" TYPE "payment_method"
  USING (
    CASE WHEN "payment_method"::text = 'BankTransfer' THEN 'BDO'
         ELSE "payment_method"::text
    END::"payment_method"
  );
ALTER TABLE "sale_items"
  ALTER COLUMN "payment_method" TYPE "payment_method"
  USING (
    CASE WHEN "payment_method"::text = 'BankTransfer' THEN 'BDO'
         ELSE "payment_method"::text
    END::"payment_method"
  );

ALTER TABLE "sales" ALTER COLUMN "payment_method" SET DEFAULT 'Cash';
ALTER TABLE "sale_items" ALTER COLUMN "payment_method" SET DEFAULT 'Cash';

DROP TYPE "payment_method_old";

-- ----------------------------------------------------------------------------
-- 2. Migrate Split breakdowns in the paymentSplit JSON: move the old
--    `bankTransfer` amount into `bdo`, and ensure a `bpi` key exists (0).
--    Totals are unchanged — the money was always counted; it just moves from
--    the generic bank bucket into BDO.
-- ----------------------------------------------------------------------------
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
