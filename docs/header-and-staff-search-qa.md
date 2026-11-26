# VP header, navigation and Staff search fixes

Scope: Vape and Sounds only. No backend, financial calculation, role permission, database, deployment configuration, wallpaper or payment-method changes.

## Confirmed issues and fixes

- Staff's narrower sidebar wrapped the business name into two lines (48px), while Owner/Admin displayed one line (24px). `BrandIdentity` now supplies the same 36px mark, name, subtitle and spacing in both layouts and their mobile headers. The existing sidebar widths and responsive breakpoints stay in place.
- Mobile navigation could remain open after Escape, allowed background scrolling, and left offscreen navigation keyboard-focusable. The shared mobile-only hook adds Escape close, scroll locking/restoration, focus containment/return, inert closed drawers and resize cleanup. Desktop navigation remains usable after a breakpoint change. It adds event listeners, not polling or API requests.
- Escape did not close a portaled Select after keyboard focus moved from its trigger into an option. The open dropdown now handles Escape in document capture, returns focus to its trigger and stops the event from also closing an underlying modal/drawer. Mouse selection behavior is preserved.
- Staff Home discarded parent products that the API returned for matching flavors/colors, because its local filter checked only the parent name. It now uses the same active-option-aware matching helper as the existing Staff catalogue screens.
- Staff Home requested products even without a search. It now requests only after a debounced nonempty search and an assigned branch. Matching pages load in bounded 200-product batches, using the existing all-pages hook, so results beyond the initial page remain visible. Clearing search makes no product request. Failed product searches show a retry action rather than a false empty result. An unassigned Staff account sees an assignment message and makes no catalogue requests.

## Validation

- Frontend production build, TypeScript checking, and existing `check:efficiency` checks passed.
- Before and after scans exercised 112 route/theme/viewport combinations using local mocked APIs: Owner/Admin dashboard pages, catalogues, sales, archives/settings and Staff screens. No root overflow, broken images or page errors were observed. This is a smoke check, not proof of every production workflow or data shape.
- Thirty targeted header/navigation cases: Owner/Admin/Staff, light/dark, 320/390/768/1024/1440px. Verified one-line name, common logo sizing, mobile centering, Escape, focus wrap/return, restored preexisting scroll styles, inert closed drawers and desktop/mobile resizing.
- Portaled dropdown Escape and mouse selection passed in both themes. Staff purchase-modal flavor selection still applies on the first click; Escape closes the picker without closing the modal.
- Staff search fixture: no initial product fetch; Mango flavor finds parent products; 205 matches arrive across two bounded branch-scoped pages; clearing makes no request. Product-search failure/retry and an unassigned-account case passed.

## Manual regression steps

1. Compare the sidebar and mobile header as Owner, Admin and Staff in both themes. The logo/name/subtitle should align; the name should not wrap at 320px and above.
2. Open the mobile menu, Tab/Shift+Tab through it, then press Escape. Focus should return to the menu trigger and the page should scroll again. Reopen, resize to desktop, then back to mobile; the page must not remain scroll-locked and the closed drawer must not capture focus.
3. Open a Select, move focus into an option and press Escape. Only that dropdown should close. Reopen and select by mouse/touch. Repeat in Staff Add Purchase with a flavor/color.
4. On Staff Home, search an existing flavor/color, including a product beyond the first result page. Confirm correct branch-specific results. Check a failed search and Retry, clear the search, and check an account without a shop assignment.

All browser data and requests used local fixtures; no production user accounts, stock, sales or database records were edited. The broader production data set and physical-device browsers were not accessed.
