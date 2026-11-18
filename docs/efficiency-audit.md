# VP and Sounds efficiency audit

Scope: CPU/runtime, database work, egress, and storage. This does not import Chix reporting features or its redesign. Existing Records search, filters, row limits, and client pagination stay unchanged. Existing payment methods remain Cash, Gcash, BDO, BPI, Split; the business-day cutoff remains 12 AM–12 AM Philippine time.

## Optimizations

- Sales list summaries now aggregate payments, discounts, and gross sales in PostgreSQL, rather than sending every matching historical item to Node for a JavaScript reduction. API response fields and sale-level search semantics stay the same. Staff branch restrictions still apply.
- Branch summary combines payment buckets and discount into one SQL aggregate instead of one item-array query plus a separate discount query. Its top-level database operations drop from five to four. Pending Staff scope and approved/decided-today management scope remain unchanged.
- Owner capital uses a scalar database sum of each saved sale-item cost multiplied by quantity. It runs alongside the other profit queries instead of fetching and reducing a historical cost array afterward. Admin does not call this Owner-only endpoint or read cost-derived fields.
- Sale reads select only item fields used by the serializer. Unused cost snapshots and sale IDs no longer travel from PostgreSQL to Node for these reads. Cost snapshot writes and financial calculations remain intact.
- The existing Most Disposed Products chart requests grouped approved totals instead of downloading raw disposal records with staff/image/reason metadata and grouping them in the browser. This reads the full approved history instead of an arbitrary first 200 records. The chart layout and controls are unchanged. Owner receives saved cost valuation; Admin receives saved selling valuation. Staff cannot access this company-wide endpoint.
- Canceled reads stop immediately and are not replayed. Automatic transient retries are restricted to GET/HEAD; failed writes are not automatically repeated. Existing read cold-start recovery stays bounded, and React Query no longer repeats an exhausted Axios retry chain. Auth refresh-on-401 remains available.
- Heartbeat skips hidden/offline tabs, removes redundant health pings, and does not restart its timer when the token rotates. Visible online refresh keeps its ten-minute cadence. A hidden tab can exceed the server's configured session idle timeout and require login again.
- Records/disposal hooks pass AbortSignal so abandoned requests can stop. Existing 45-second query freshness, five-minute query garbage collection, disabled focus refetch, visibility-aware Pending polling, response compression, and lazy thumbnails remain in place. No report polling was added.

## Storage audit

No database migration, table, index, stored aggregate, server financial cache, new runtime dependency, or extra image derivative is introduced. These read-path changes do not shrink already-stored data.

The current image pipeline crops to 256px and targets about 100KB using WebP/JPEG quality reduction. Cloudinary uploads normally leave only a URL in PostgreSQL. Re-saving a hosted URL does not upload it again; thumbnails load lazily. **If Cloudinary is unconfigured or an upload fails, the existing fallback stores an inline base64 image.** That can increase both database size and repeated API egress. Its configuration and historical inline-image count were not verified against the deployed service, and the fallback behavior has not been changed by this PR.

Sales, stock movements, and audit logs intentionally retain history and continue to grow. Session rows also have expiry dates but there is no general expired-session pruning job in the inspected login path. No records or cloud assets were deleted, and no speculative retention policy or extra scheduled worker was added. Historical inline-image migration, expired-session retention, or orphan-image cleanup should be evaluated separately against real data and shared-asset usage.

Optional read-only PostgreSQL diagnostics for a provider console (not executed during this audit):

```sql
SELECT pg_size_pretty(pg_database_size(current_database())) AS database_size;
SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
       n_live_tup AS estimated_rows
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 15;
SELECT COUNT(*) AS inline_product_images
FROM products WHERE image LIKE 'data:%';
SELECT COUNT(*) AS expired_sessions
FROM sessions WHERE expires_at < CURRENT_TIMESTAMP;
```

## Validation and limits

- Backend: **17 suites / 168 tests passed**; backend build and frontend production build passed.
- `npm --prefix frontend run check:efficiency` passed: actual interceptor checks cover cancellation, write replay, retry limits, and prevention of layered retry multiplication; heartbeat tests cover visibility, connectivity, token rotation, and cleanup.
- Actual parameterized aggregate SQL runs in local PostgreSQL/PGlite fixtures: payment channels, standalone and split amounts, discount treatment, branch/date/status/approval scope, legacy sale-level search, empty/injection-like search input, and saved-cost capital are checked.
- Eight browser flows cover Owner/Admin, dark/light, 390px/1440px dashboard, Records, and Disposals views. Existing search/paging contracts, compact chart requests, and no page errors/overflow were checked. A Staff report smoke check also passed.
- Browser clock checks confirm no periodic Records queries; hidden/offline ticks produce no heartbeat refresh; visible online refresh still runs without duplicate health calls or intervals after token rotation.
- A separate local 50,000-item fixture returned 50,000 summary-source rows before and one aggregate row after, with equal gross/discount/payment totals. JSON representations were 5,650,001 bytes before and 112 bytes after. This is a representation-size comparison, **not measured PostgreSQL network traffic or a percentage reduction in the site's total egress**.

No live database, Render CPU/runtime metrics, Supabase egress/storage metrics, or Cloudinary quota dashboard was accessed. PostgreSQL still needs to scan applicable records to aggregate them; the optimization avoids transferring/materializing those records in Node. Normal active Pending polling and visible authentication refresh still consume resources. Actual traffic, historical data, hosting plans, image configuration, and query plans determine quota usage; this audit does not guarantee that a free-tier quota cannot be exhausted.
