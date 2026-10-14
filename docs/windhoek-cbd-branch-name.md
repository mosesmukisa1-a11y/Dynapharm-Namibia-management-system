# Windhoek CBD branch name

Windhoek CBD and Townshop are one branch. The operator confirmed that the
official name must be **Windhoek CBD**.

Both production and development branch registries already contain:

| Field | Value |
| --- | --- |
| Internal branch ID | `townshop` |
| Official name | `Windhoek CBD` |
| Branch code | `WDH-CBD` |

Do not rename the internal ID, create a second branch, or merge warehouse-owned
Windhoek locations into this branch. Keeping the ID preserves existing staff
scope, stock, sales and prescription links.

## Activity labels

The shared activity writer now uses Windhoek CBD as the display name for this
branch even if a caller sends `townshop` as its name. The activity read endpoint
also displays Windhoek CBD for existing rows and accepts either name as a filter.
Other branches and warehouses keep their own identities.

On 14 October 2026, four development activity labels were changed from
`townshop` to `Windhoek CBD`. A same-statement before/after check confirmed every
other field was unchanged, including IDs, timestamps, quantities and financial
values. This is not a sale-evidence repair or stock posting.

Production was inspected read-only. Its branch registry was already correct,
but its activity table contained 1,806 `townshop` display labels and 16
`Windhoek CBD` labels at the time of review. No production activity labels were
changed by this task. Development data edits do not migrate into production
through a code merge.

## Optional production label correction

An authorized primary-database operator may use the following **data-only**
transaction to standardize old activity labels. It is not an automatic migration
and must not be added to startup, deployment or post-merge scripts. It changes
only the label of rows whose exact stored branch ID is `townshop`.

```sql
BEGIN;

WITH target AS MATERIALIZED (
  SELECT id, to_jsonb(t) AS before
  FROM branch_activity_transactions t
  WHERE branch_id = 'townshop'
    AND lower(btrim(branch_name)) IN
      ('townshop', 'town shop', 'windhoek_cbd', 'windhoek cbd')
    AND branch_name IS DISTINCT FROM 'Windhoek CBD'
  FOR UPDATE
), changed AS (
  UPDATE branch_activity_transactions t
  SET branch_name = 'Windhoek CBD'
  FROM target s
  WHERE t.id = s.id
  RETURNING t.id, to_jsonb(t) AS after
)
SELECT count(*) AS labels_updated,
       coalesce(bool_and((s.before - 'branch_name') =
                         (c.after - 'branch_name')), true)
         AS all_other_fields_unchanged
FROM changed c
JOIN target s USING (id);

-- Verify the count against the current reviewed scope and require
-- all_other_fields_unchanged = true. Otherwise ROLLBACK.
-- The transaction remains uncommitted until the operator chooses:
-- COMMIT;
-- ROLLBACK;
```

This label correction does not authorize reconstruction of prescription session
evidence, modification of prices or payments, stock changes, or replay of sales.
