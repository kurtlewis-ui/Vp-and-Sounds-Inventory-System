# VP and Sounds mobile, theme and branding audit

Date: 2026-11-15. Scope: Vp-and-Sounds-Inventory-System only.

## Fixed

- Dropdown menus rendered through a body portal now inherit the selected light/dark theme. Shared confirmation dialogs and floating notifications use the same theme.
- Light theme now sets an inherited foreground color, keeping Product type, branch and quantity labels readable. Muted metadata and low-stock/error colors have stronger contrast. Draft net values and Owner badges also have light-theme colors.
- Image cropping, Shop and Brand dialogs have a 90vh height limit with internal scrolling, so their controls remain reachable on short landscape screens.
- Settings password fields have 44px minimum height. Their visibility button has a 44px target, an accessible Show/Hide label and pressed state.
- The 404 uses the actual Vape and Sounds logo and follows the saved theme. Full backups use the Vape and Sounds filename. New default image uploads use the vape-and-sounds namespace; existing image URLs remain valid.

## Validation

| Coverage | Result |
| --- | --- |
| Backend tests, including new upload namespace/retention regressions | 126 passed |
| Nest backend and Next frontend production builds/type checks | Passed |
| Page checks: 320, 390, 768 and 1440px widths, light and dark | 224 passed; no page exceptions, root horizontal overflow or broken fixture images |
| Theme/product/profile/404 flows, mobile and desktop | 4 passed |
| Short landscape image crop and password flows, Owner and Staff, both themes | 4 passed |
| Shop/Brand create, product restore, Admin approve/decline, Staff sale/disposal/expense drafts | 14 passed |
| Owner/Admin/Staff login landing, unauthenticated redirect and invalid login feedback | 4 passed |
| Full backup workbook regression: option identities, branch stock, ordinary products, no duplicated parent stock | Passed |

Page coverage includes all 18 Owner screens: Dashboard, Shops, Brands, Products, Sales Records, Pending Sales, Disposals, Users, Activity Logs, all eight Archive destinations and Settings. It also includes all five Staff screens (home, brand products, all products, reports, settings), plus five Admin screens (products, sales records, pending, users, settings). Long names and populated data exercise wrapping, cards, tables and archive rows. Horizontally scrollable tables remain available inside their containers.

Functional checks validate outgoing request data against mocked APIs. Product creation checks flavor quantities applied across branches. Profile checks crop to a WebP image and submit it. Password mismatch blocks submission; Show/Hide retains all entered values. Theme persistence, visible portal text, logo/favicon/title, error messaging and pending-draft net text are checked. Representative desktop/mobile screenshots were also inspected.

Browser testing used installed Chrome with emulated viewport sizes, including 844x390 landscape. Readable light-theme status/muted colors meet 4.5:1 against the neutral canvas in token checks. This is not a full accessibility certification.

## Boundaries and deployment review

No production inventory, sales, users or database records were changed. Cloudinary was mocked in unit tests; a real hosted upload and end-to-end deployed backend/database transaction still need verification in staging. Physical phones, Safari/iOS, real network interruptions and cloud billing were not measured. Automated checks cover the flows above, not every possible combination of business data.

No refresh timers, polling, dependency changes or database migrations are added by this change. Staff product loading retains its existing manual refresh and disabled focus/interval refetch behavior. Existing account email identifiers and credentials are preserved. The previously discussed Owner/Admin financial and account-permission redesign is separate work.

Suggested staging check after deployment: open Products and Settings on a real phone in both themes; select a product type, apply branch quantities, inspect archive/history dialogs, crop a photo, and verify one test transaction using non-production data. Check current pricing and permissions with real Owner/Admin/Staff accounts before release.
