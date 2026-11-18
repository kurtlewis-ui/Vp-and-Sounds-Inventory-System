# Owner and Admin permissions

Owner and Admin share product creation, import, restock, reorder, stock reset/undo, full product and brand editing, shop creation/editing, pending-sale editing, approval queues and archive/restore operations.

Admin uses the full Users page to create, edit, reset passwords, archive and restore Admin and Staff accounts. The role picker and account lists exclude Owner. Server-side checks reject creation/promotion to Owner and modification, password reset, archive or restore of Owner accounts. Existing self-delete protection and session revocation remain in place.

Cost stays confidential. Product create/update strips non-Owner cost input before ordinary or flavor/color persistence, and existing product serializers omit cost from Admin responses. An Admin edit preserves existing cost. A newly created product has the existing zero-cost default until an Owner supplies its cost; Owner profit figures depend on entering that cost correctly.

Dashboard and disposal valuation remain unchanged: Owner sees cost-based disposal losses, capital and margin. Admin sees gross sales, expenses, selling-value disposals, discounts and Net Total, without cost-derived profit metrics. Profit APIs remain Owner-only.

Validation: frontend/backend production builds; backend permission, stock, account, sale, cost-confidentiality and disposal tests; 48 browser management checks across both roles, dark/light themes and mobile/desktop widths. Browser and unit checks use mock data. No live database records or schema were changed.
