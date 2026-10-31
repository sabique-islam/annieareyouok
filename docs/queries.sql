-- Important queries for the UCDI desk.
-- The same statements are registered in lib/queries/named-queries.ts and can be run from Queries.
-- They are read-only. The application never executes SQL typed by a browser.

-- VIEW + CASE + ORDER BY: ask versus the stored residual.
SELECT vin, make, model, model_year, list_price, estimated_value, price_gap, price_signal
FROM vw_fleet_intelligence
ORDER BY price_signal, make, model;

-- JOIN + GROUP BY + HAVING + SUM: makes whose defect repairs exceed ₹20,000.
SELECT cm.make,
       COUNT(df.defect_id) AS defects,
       SUM(df.repair_cost_estimate) AS repair_total
FROM defects df
JOIN inspections i ON i.inspection_id = df.inspection_id AND i.status = 'completed'
JOIN vehicles v ON v.vehicle_id = i.vehicle_id
JOIN catalog_models cm ON cm.model_id = v.model_id
GROUP BY cm.make
HAVING SUM(df.repair_cost_estimate) > 20000
ORDER BY repair_total DESC;

-- JOIN + correlated subquery + AVG.
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

-- NOT EXISTS.
SELECT v.vin, cm.make, cm.model, v.status
FROM vehicles v
JOIN catalog_models cm ON cm.model_id = v.model_id
WHERE NOT EXISTS (
  SELECT 1
  FROM inspections i
  WHERE i.vehicle_id = v.vehicle_id
    AND i.status = 'completed'
)
ORDER BY v.vin;

-- Window function.
SELECT cm.make,
       cm.model,
       v.vin,
       v.list_price,
       RANK() OVER (PARTITION BY cm.make ORDER BY v.list_price DESC) AS price_rank_in_make
FROM vehicles v
JOIN catalog_models cm ON cm.model_id = v.model_id
ORDER BY cm.make, price_rank_in_make, v.vin;

-- JOIN + GROUP BY + HAVING + COUNT. Recorded sales are not inputs to the residual.
SELECT cm.make,
       cm.model,
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

-- Full-text search on the inspection summary.
SELECT i.inspection_id, v.vin, ts_rank(i.search_vector, plainto_tsquery('english', 'damp footwell')) AS rank
FROM inspections i
JOIN vehicles v ON v.vehicle_id = i.vehicle_id
WHERE i.status = 'completed'
  AND i.search_vector @@ plainto_tsquery('english', 'damp footwell')
ORDER BY rank DESC;

-- Cosine similarity. $1 is a 64-d vector from ucdi-hash-64-v1.
-- SELECT inspection_id, 1 - (embedding <=> $1::vector) AS similarity
-- FROM inspection_embeddings
-- ORDER BY embedding <=> $1::vector
-- LIMIT 5;
