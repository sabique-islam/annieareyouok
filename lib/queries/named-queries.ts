export type NamedQuery = {
  name: string;
  title: string;
  shows: string;
  blurb: string;
  sql: string;
};

export const NAMED_QUERIES: NamedQuery[] = [
  {
    name: "price_signals",
    title: "Ask vs residual",
    shows: "VIEW, CASE, ORDER BY",
    blurb: "Reads the fleet intelligence view. The signal is ask versus the stored residual.",
    sql: `SELECT vin, make, model, model_year, list_price, estimated_value, price_gap, price_signal
FROM vw_fleet_intelligence
ORDER BY price_signal, make, model`,
  },
  {
    name: "costly_repairs",
    title: "Repair totals",
    shows: "JOIN, GROUP BY, HAVING, SUM",
    blurb: "Keeps makes whose completed-inspection defects sum to more than ₹20,000.",
    sql: `SELECT cm.make,
       COUNT(df.defect_id) AS defects,
       SUM(df.repair_cost_estimate) AS repair_total
FROM defects df
JOIN inspections i ON i.inspection_id = df.inspection_id AND i.status = 'completed'
JOIN vehicles v ON v.vehicle_id = i.vehicle_id
JOIN catalog_models cm ON cm.model_id = v.model_id
GROUP BY cm.make
HAVING SUM(df.repair_cost_estimate) > 20000
ORDER BY repair_total DESC`,
  },
  {
    name: "above_make_average",
    title: "Above make average",
    shows: "JOIN, subquery, AVG",
    blurb: "Vehicles whose asking price is above the average ask for the same make.",
    sql: `SELECT v.vin, cm.make, cm.model, v.list_price
FROM vehicles v
JOIN catalog_models cm ON cm.model_id = v.model_id
WHERE v.list_price > (
  SELECT AVG(v2.list_price)
  FROM vehicles v2
  JOIN catalog_models cm2 ON cm2.model_id = v2.model_id
  WHERE cm2.make = cm.make
)
ORDER BY cm.make, v.list_price DESC`,
  },
  {
    name: "never_inspected",
    title: "Not inspected",
    shows: "NOT EXISTS, subquery",
    blurb: "Inventory that still has no completed condition file.",
    sql: `SELECT v.vin, cm.make, cm.model, v.status
FROM vehicles v
JOIN catalog_models cm ON cm.model_id = v.model_id
WHERE NOT EXISTS (
  SELECT 1
  FROM inspections i
  WHERE i.vehicle_id = v.vehicle_id
    AND i.status = 'completed'
)
ORDER BY v.vin`,
  },
  {
    name: "price_rank",
    title: "Price rank",
    shows: "window function RANK()",
    blurb: "Ranks cars by ask inside their make.",
    sql: `SELECT cm.make,
       cm.model,
       v.vin,
       v.list_price,
       RANK() OVER (PARTITION BY cm.make ORDER BY v.list_price DESC) AS price_rank_in_make
FROM vehicles v
JOIN catalog_models cm ON cm.model_id = v.model_id
ORDER BY cm.make, price_rank_in_make, v.vin`,
  },
  {
    name: "ask_vs_market",
    title: "Ask vs sales",
    shows: "JOIN, GROUP BY, HAVING, COUNT",
    blurb: "Compares our asks with recorded sales of the same model. Sales are not inputs to the residual formula.",
    sql: `SELECT cm.make,
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
ORDER BY cm.make, cm.model`,
  },
  {
    name: "inspector_load",
    title: "Inspectors",
    shows: "VIEW, aggregate FILTER",
    blurb: "Completed files and average scores from vw_inspector_load.",
    sql: `SELECT full_name, completed_inspections, avg_score, last_30_days
FROM vw_inspector_load
ORDER BY completed_inspections DESC, full_name`,
  },
  {
    name: "recent_audit",
    title: "Audit",
    shows: "trigger output, JSONB, ORDER BY",
    blurb: "Rows written by the vehicle audit trigger. changed_by comes from the transaction setting ucdi.user_id.",
    sql: `SELECT a.changed_at,
       u.full_name AS changed_by,
       a.record_id AS vehicle_id,
       a.old_data->>'list_price' AS old_price,
       a.new_data->>'list_price' AS new_price,
       a.old_data->>'current_grade' AS old_grade,
       a.new_data->>'current_grade' AS new_grade,
       a.old_data->>'status' AS old_status,
       a.new_data->>'status' AS new_status
FROM audit_log a
LEFT JOIN users u ON u.user_id = a.changed_by
ORDER BY a.changed_at DESC
LIMIT 15`,
  },
];

export function findQuery(name: string) {
  return NAMED_QUERIES.find((item) => item.name === name) ?? null;
}
