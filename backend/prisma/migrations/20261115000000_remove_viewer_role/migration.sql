-- Preserve user IDs and all historical references. Retired accounts receive
-- no active access: sessions are revoked and explicit reactivation is required.
BEGIN;

INSERT INTO "roles" ("id", "name", "description", "permissions", "updated_at")
VALUES (gen_random_uuid(), 'Staff', 'Branch-scoped sales access',
        '{"catalog":["read"],"sales":["create","read"]}'::jsonb, NOW())
ON CONFLICT ("name") DO NOTHING;

DELETE FROM "sessions"
WHERE "user_id" IN (
  SELECT u."id" FROM "users" u JOIN "roles" r ON r."id" = u."role_id"
  WHERE r."name" = 'Viewer'
);

UPDATE "users"
SET "role_id" = (SELECT "id" FROM "roles" WHERE "name" = 'Staff'),
    "is_active" = FALSE, "branch_id" = NULL,
    "must_change_password" = TRUE, "updated_at" = NOW()
WHERE "role_id" IN (SELECT "id" FROM "roles" WHERE "name" = 'Viewer');

DELETE FROM "roles" WHERE "name" = 'Viewer';

COMMIT;
