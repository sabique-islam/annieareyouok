# Schema map

PostgreSQL holds the yard: accounts, cars, inspection files, residuals, and the audit trail. MongoDB holds the dossier, because one car has OBD codes and photo labels and the next has none. Types and checks are in `db/schema.sql`.

`db/schema.sql` drops and recreates `public`, then builds the tables. `load_staging` is created, given a column, and dropped in that script. It is not part of the model. It is there so `CREATE`, `ALTER`, and `DROP` actually run.

## Tables

| Table | Job | Why this |
| --- | --- | --- |
| `roles` | The three desk roles: admin, inspector, buyer. | A table is the foreign key `users` joins. The check keeps the set closed. An enum would need `ALTER TYPE` to add a role. |
| `users` | Login. Email is unique. `password_hash` must start with `$2a$`, `$2b$`, or `$2y$`. | The check rejects a plaintext password. The trigger stores the email lowercase, so `Admin@` and `admin@` are one row. |
| `dealers` | The yard. `license_no` is the business key. | A car points at a dealer. The license is what the yard is known by outside this database. |
| `catalog_models` | Make, model, and segment. `(make, model)` is unique. | Recorded sales point here. A sale is someone else's car, so it cannot point at `vehicles`. Make and model only on the vehicle would leave that sale with no key. |
| `vehicles` | One stock unit. VIN is 17 characters, no I, O, or Q. | `condition_score` and `current_grade` are copies of the latest completed inspection, written by a trigger. The fleet list and the audit log read them. The view still looks up the latest file when it needs the summary and the residual. `model_year` is added with `ALTER` so that statement runs. |
| `inspections` | One filed report: draft, completed, or void. | `search_vector` is a stored generated column of `summary` alone, so the GIN index cannot drift, and the narrative stays out of full-text. |
| `inspection_checkpoints` | One row per checklist item. Item name is unique inside the inspection. | Checkpoints exist only as part of a file, so they cascade when that inspection is deleted. |
| `defects` | A repair line. `repair_cost_estimate` is what the residual sums. | `checkpoint_id` may be null. Deleting a checkpoint sets it null. Deleting the inspection still removes the defect. |
| `depreciation_estimates` | One row per computation: factors, gross, penalty, value, method, and which inputs were used. | A column on the vehicle would change when the next file is saved and would erase the earlier quote. `assumptions` is `inspection`, `latest_completed`, or `uninspected_prior`. |
| `inspection_embeddings` | One 64-d vector per inspection. | It sits next to the inspection so search can filter on status in the same query. A separate vector store would split that filter from the grade and the price. |
| `market_sales` | Recorded sales of the same catalog model. | Comparison only. `fn_depreciation_breakdown` does not read this table. |
| `audit_log` | Before and after for list price, status, condition score, odometer, and grade. | The trigger writes it. The app does not insert here. JSONB holds those five fields. A full-row copy would store columns the desk does not review. |

Ids are `GENERATED ALWAYS AS IDENTITY`. An insert cannot choose the id.

## Delete rules

| When this goes away | What happens | Why |
| --- | --- | --- |
| A vehicle that still has an inspection | Delete is refused (`ON DELETE RESTRICT`). | A car with a file cannot disappear. |
| An inspection (draft or void) | Checkpoints, defects, and the embedding cascade. | Those rows have no meaning without the file. |
| A completed inspection | The delete trigger refuses it. | Void the file. The row and the residual history stay. |
| A checkpoint | `defects.checkpoint_id` becomes null. | The repair line can outlive that checkpoint. |
| The inspection id on an estimate, or the user on an estimate or an audit row | The foreign key becomes null. | The quoted value and the audit row stay after a draft or a user is removed. |

## Residual

`fn_grade_from_score` is immutable. 85 and up is A, 70 is B, 55 is C, 40 is D, below that is F. The sync trigger and any query call this, so the cuts live in one place.

`fn_depreciation_breakdown` is the residual, version `ucdi-residual-v1`. It is stable. A non-positive MSRP raises. A missing score is treated as 70.

Age is the calendar year of the as-of date minus the model year, and not below 0.

- Age 0 keeps 0.96. Older cars use `max(0.35, 0.88 × 0.94^(age - 1))`.
- Expected use is 12,000 km for each year of age: every extra 10,000 km cuts 2.5% up to a 25% cut, and a car under that use gains at most 8%.
- Condition is `0.78 + 0.22 × score/100`.
- Gross is MSRP times the three factors, rounded to rupees. Repair cost is then subtracted, but only up to 15% of gross, and the result cannot fall below 10% of MSRP.

The function lives in the database so the desk, the seed, and the SQL lab share one formula. A generated column would move when the inputs move and would drop the previous quote.

`fn_store_depreciation` locks the vehicle (`FOR UPDATE`), chooses inputs, inserts one estimate, and returns `estimate_id`.

- An inspection id uses that file's score and defect sum. The inspection must belong to the vehicle. `assumptions` is `inspection`.
- No id uses the latest completed file (`inspection_date`, then `inspection_id`). `assumptions` is `latest_completed`.
- No completed file uses the score already on the vehicle, or 70, and zero defects. `assumptions` is `uninspected_prior`.

`sp_record_depreciation` calls that function and does not commit. Filing a report is one transaction in the app. A commit inside the procedure would keep a residual after the inspection rolled back.

## Triggers

A check looks at the row being written. These rules look at the old row, another table, or a count of other rows, so they are triggers.

| Trigger | When | What it enforces |
| --- | --- | --- |
| `users_before` | Before insert or update on `users` | Trims and lowercases email. Refuses to deactivate the last active admin. |
| `vehicles_before` | Before update on `vehicles` | Refuses a lower odometer. Sets `updated_at`. If price, status, score, odometer, or grade changed, writes `audit_log`. |
| `checkpoint_rules` | Before insert or update on checkpoints | A fail cannot have severity `none`. A pass cannot be `major` or `critical`. |
| `inspection_odometer` | Before insert or update of odometer or vehicle on an inspection | The inspection reading cannot sit below the kilometres already on the car. |
| `sync_vehicle_condition` | After insert, or after status or score changes | If this file is the latest completed one, copies score and grade onto the car, raises the odometer with `GREATEST`, and moves `under_inspection` to `available`. Sold and withdrawn stay. Voiding a completed file copies the previous completed score back, or null if none remains. The odometer is not rolled back. |
| `block_completed_delete` | Before delete on `inspections` | A completed file cannot be deleted. |

`changed_by` is `current_setting('ucdi.user_id', true)`, cast to an integer. The trigger cannot see the JWT. The app sets that value for the transaction. If it is unset, the audit row stores null.

`checkpoint_rules` could be two checks. The trigger is there so the error text names the rule.

## Indexes

| Index | Supports |
| --- | --- |
| `vehicles (model_id)`, `(dealer_id)`, `(status)`, `(current_grade)` | Fleet filters. |
| `inspections (vehicle_id, inspection_date DESC, inspection_id DESC)` | The latest-file order used by the view and by `fn_store_depreciation`. |
| `inspections (inspector_id)` | Inspector load. |
| GIN on `search_vector` | Full-text on the summary. |
| HNSW on `embedding` with `vector_cosine_ops` | Nearest narrative by cosine distance (`<=>`). |
| `defects (inspection_id)`, `(severity)` | The repair sum and severity filters. |
| `depreciation_estimates (vehicle_id, computed_at DESC)` | The latest residual. |
| `market_sales (model_id, sold_on DESC)` | Sales of one model. |
| `audit_log (changed_at DESC)` | The recent audit list. |

## Views

`vw_fleet_intelligence` is one row per vehicle. Two `LATERAL` lookups take the latest completed inspection and the latest estimate, each with `ORDER BY` and `LIMIT 1`. A grouped join would hide that limit inside two subqueries. The lateral keeps it beside the car.

`price_signal` is `unpriced` when there is no estimate. An ask more than 8% above the residual is `overpriced`. More than 8% below is `underpriced`. Otherwise `fair`. The band stops a small gap from flipping the label. `price_gap` is ask minus residual.

`vw_inspector_load` is one row per inspector. `FILTER` counts completed files, their average score, and files dated in the last 30 days in one pass.

## Queries

The SQL lab runs the statements in `lib/queries/named-queries.ts`. They are read-only. The browser does not send SQL. The same text is in `docs/queries.sql`, plus the full-text and cosine forms below.

### Ask vs residual

```sql
SELECT vin, make, model, model_year, list_price, estimated_value, price_gap, price_signal
FROM vw_fleet_intelligence
ORDER BY price_signal, make, model;
```

Reads the stored snapshot. It does not call `fn_depreciation_breakdown`. Recomputing in the `SELECT` would hide a stale row and would disagree with the quote that was saved. `ORDER BY price_signal` puts rows that share a label together. The labels sort as text: fair, overpriced, underpriced, unpriced.

### Repair totals

```sql
SELECT cm.make, COUNT(df.defect_id) AS defects, SUM(df.repair_cost_estimate) AS repair_total
FROM defects df
JOIN inspections i ON i.inspection_id = df.inspection_id AND i.status = 'completed'
JOIN vehicles v ON v.vehicle_id = i.vehicle_id
JOIN catalog_models cm ON cm.model_id = v.model_id
GROUP BY cm.make
HAVING SUM(df.repair_cost_estimate) > 20000
ORDER BY repair_total DESC;
```

Sums repair estimates by make, for completed files only. A draft must not count as exposure, so the status filter is in the join. `HAVING` drops makes whose total is ₹20,000 or less. `WHERE` would drop defect rows before the sum, which is the wrong moment for a total.

### Above make average

```sql
SELECT v.vin, cm.make, cm.model, v.list_price
FROM vehicles v
JOIN catalog_models cm ON cm.model_id = v.model_id
WHERE v.list_price > (
  SELECT AVG(v2.list_price)
  FROM vehicles v2
  JOIN catalog_models cm2 ON cm2.model_id = v2.model_id
  WHERE cm2.make = cm.make
)
ORDER BY cm.make, v.list_price DESC;
```

Keeps a car whose ask is above the average ask of its make. The correlated subquery is that comparison. `AVG() OVER (PARTITION BY make)` computes the same number, and then an outer query has to filter, because a window cannot appear in `WHERE`. On a large fleet the window scans once. This yard has two Hondas and two Marutis, so the higher ask of each pair is returned. A make with one car is equal to its own average and drops out.

### Not inspected

```sql
SELECT v.vin, cm.make, cm.model, v.status
FROM vehicles v
JOIN catalog_models cm ON cm.model_id = v.model_id
WHERE NOT EXISTS (
  SELECT 1 FROM inspections i
  WHERE i.vehicle_id = v.vehicle_id AND i.status = 'completed'
)
ORDER BY v.vin;
```

Cars with no completed file. A draft still leaves the car in the result. `NOT EXISTS` stops at the first match. `NOT IN` would also work while `vehicle_id` is never null, and becomes unknown if any selected value is null. A `LEFT JOIN` whose inspection id is null returns the same cars, and is the form to use when the query needs columns from the missing side. This one does not.

### Price rank

```sql
SELECT cm.make, cm.model, v.vin, v.list_price,
       RANK() OVER (PARTITION BY cm.make ORDER BY v.list_price DESC) AS price_rank_in_make
FROM vehicles v
JOIN catalog_models cm ON cm.model_id = v.model_id
ORDER BY cm.make, price_rank_in_make, v.vin;
```

Every car, with its place by ask inside the make. Ties share a rank and the next rank skips. `ROW_NUMBER` would break the tie by force. `DENSE_RANK` would not skip. `GROUP BY` would collapse the cars into one row per make.

### Ask vs sales

```sql
SELECT cm.make, cm.model,
       ROUND(AVG(v.list_price), 0) AS avg_ask,
       ROUND(AVG(ms.sale_price), 0) AS avg_recorded_sale,
       COUNT(DISTINCT v.vehicle_id) AS cars_in_fleet,
       COUNT(ms.sale_id) AS recorded_sales
FROM catalog_models cm
JOIN vehicles v ON v.model_id = cm.model_id
JOIN market_sales ms ON ms.model_id = cm.model_id
GROUP BY cm.make, cm.model
HAVING COUNT(ms.sale_id) >= 2
ORDER BY cm.make, cm.model;
```

Average ask against average recorded sale for the same model. The inner joins drop a model that has no car on the lot or no recorded sale. `HAVING` drops a model with a single sale, so one observation is not treated as a market. These sales are not inputs to the residual.

The join is cars × sales of that model. With one car per model, `COUNT(ms.sale_id)` equals the number of sales, and both averages are unweighted. A second car of the same model repeats each sale. `cars_in_fleet` uses `COUNT(DISTINCT)` so that count stays honest. `recorded_sales` would then count the product.

### Inspectors

```sql
SELECT full_name, completed_inspections, avg_score, last_30_days
FROM vw_inspector_load
ORDER BY completed_inspections DESC, full_name;
```

The view already aggregated. This query sorts.

### Audit

```sql
SELECT a.changed_at, u.full_name AS changed_by, a.record_id AS vehicle_id,
       a.old_data->>'list_price' AS old_price, a.new_data->>'list_price' AS new_price,
       a.old_data->>'current_grade' AS old_grade, a.new_data->>'current_grade' AS new_grade,
       a.old_data->>'status' AS old_status, a.new_data->>'status' AS new_status
FROM audit_log a
LEFT JOIN users u ON u.user_id = a.changed_by
ORDER BY a.changed_at DESC
LIMIT 15;
```

The last 15 rows the vehicle trigger wrote. `->>` pulls the text out of the JSON. The join is a left join because `changed_by` is null when the transaction did not set `ucdi.user_id`.

### Full-text

```sql
SELECT i.inspection_id, v.vin,
       ts_rank(i.search_vector, plainto_tsquery('english', 'damp footwell')) AS rank
FROM inspections i
JOIN vehicles v ON v.vehicle_id = i.vehicle_id
WHERE i.status = 'completed'
  AND i.search_vector @@ plainto_tsquery('english', 'damp footwell')
ORDER BY rank DESC;
```

`@@` matches the summary. `ts_rank` orders the hits. `plainto_tsquery` turns the typed phrase into an English tsquery, so the caller does not write operators. "damp footwell" hits because those words are in a summary. "hidden corrosion inside the cabin" does not, because they are not. The desk runs the same match with the user's text and keeps five rows.

### Cosine

```sql
SELECT i.inspection_id, v.vin,
       GREATEST(0, 1 - (e.embedding <=> $1::vector)) AS similarity
FROM inspection_embeddings e
JOIN inspections i ON i.inspection_id = e.inspection_id AND i.status = 'completed'
JOIN vehicles v ON v.vehicle_id = i.vehicle_id
ORDER BY e.embedding <=> $1::vector
LIMIT 5;
```

`$1` is a 64-d vector from `ucdi-hash-64-v1` over the buyer's words. `<=>` is cosine distance. The desk shows `1 − distance`, floored at 0. The stored vector is the dossier narrative plus the defect descriptions, not the summary. That is why "hidden corrosion inside the cabin" ranks the City file, while full-text and the MongoDB text index return nothing. Completed files only, nearest five.

## MongoDB

Collection `inspection_dossiers`. One document per filed inspection. Written after the Postgres transaction commits. If that write fails, the API returns the inspection id and a warning. The SQL file is already stored.

| Field | Job |
| --- | --- |
| `sqlInspectionId` | Unique link to `inspections.inspection_id`. |
| `vin` | Copied so a dossier query does not join back to Postgres. |
| `narrative` | Free text. This is what gets embedded. |
| `environment` | `city`, `weather`, `lighting`. Not columns on the inspection. |
| `obdCodes` | Zero or more `{ code, description }`. |
| `media` | Labels only, `{ label, kind }`. No file bytes. |
| `remarks` | Short notes. |
| `createdAt` | When the dossier was written. |

Indexes: unique `sqlInspectionId`, `vin`, `environment.city`, and a text index on `narrative`.

Full-text answers whether the words are in the summary. The text index answers that against the narrative. The embedding answers whether the fault is the same in other words.

Analytics stays in Mongo for the fields that are not tables:

- Group by `environment.city` and `environment.weather`, count dossiers, average narrative length.
- `$unwind` `obdCodes`, then count by code.

## Who writes what

Filing a report is one Postgres transaction: the draft, the checkpoints, the defects, the score and status (the sync trigger updates the car), the embedding, then `fn_store_depreciation`. Then commit. Then the dossier.

A price change is an update on `vehicles`. `vehicles_before` writes the audit row.

If the role `ucdi` exists, the end of `db/schema.sql` grants it the tables, sequences, the `vector` type, the functions, and the procedure, and makes it the owner.
