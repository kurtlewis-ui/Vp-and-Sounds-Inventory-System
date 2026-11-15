# Admin Dashboard and financial access

Admin now lands on Dashboard and shares the Owner dashboard layout, charts and branch/date filters. Its financial card shows Total Gross Sales, Total Expenses, Total Disposal, Total Discount and Net Total. Capital, cost, margin and Owner profit analytics remain confidential.

Admin Net Total = Gross Sales - Expenses - Disposal at selling price - Discount. The API derives Gross Sales from sales subtotals plus discounts; Net Total subtracts expenses and disposal from those already-discounted subtotals. Discount is therefore deducted exactly once. Example: gross 1,000, expenses 80, selling disposal 250, discount 50 gives Net Total 620.

Owner profit continues to deduct sold-goods capital and disposal at cost. Admin/Staff disposal lists, creation/decision responses and branch summaries expose selling valuations in value/unitPrice; they never expose the stored cost snapshot. Full exports consume these role-filtered responses. Owner-only profit endpoints retain their server role guards. Existing product cost filtering and Admin restrictions on creating/promoting Owner accounts remain enforced.

Admin Archive navigation follows the same General Archives / Branch Archives grouping as Owner. It includes Staff, Shops, Brands, Products and Flavors/Colors, with branch versions for the catalog. Flavor/color list and archive/restore endpoints allow Owner/Admin and exclude Staff. Archived accounts are limited to Staff in the backend query before counting/pagination, and in the Admin UI. Admin also has the approved Disposals page, using selling valuations.

## Database deployment

The additive migration 20261116000000_disposal_selling_snapshot adds disposals.selling_value. New disposal requests store the selected branch selling value separately from the Owner cost value, including flavors/colors using their parent product price. Approvals/declines and subsequent price changes do not recalculate either snapshot.

Old rows never stored their historical selling price. The migration freezes the best available current branch/parent/product price; a removed product with no price available gets zero. Historical selling valuations are an estimate, not a recovered original price. Existing cost values, stock, record IDs and statuses are preserved. Apply migrations through the normal backend deployment before running the new backend code. No live database was changed during development.

## Validation

- 144 tests passed, covering role-restricted financial endpoints, Admin formula and date/branch scope, Owner cost profit, Staff branch scope, disposal response confidentiality and branch/option selling snapshots, account restrictions and archive scopes.
- The committed migration regression runs PostgreSQL-compatible PGlite in a disposable child process. It checks parent/branch/default price backfill, removed-product fallback, preserved cost/records and retained values after price edits.
- Backend and frontend production builds/type checks passed.
- 10 browser flows passed: Admin at 320/390/768/1440px in light/dark, and Owner dashboard regression in both themes. Checks include five summary metrics, absence of cost/profit requests, eight archive links, flavor restore, all archive pages, Disposals access and Staff-only account creation UI.
- Four mocked authentication checks passed, including Admin landing on Dashboard. Workbook export checks passed for selling-price disposal fields, active option inventory and exclusion of cost fields.

Browser APIs were mocked; live deployment/database transactions and physical phones still need staging verification. This change adds no polling, and disposal summaries no longer need to fetch every product/current inventory price to calculate totals.
