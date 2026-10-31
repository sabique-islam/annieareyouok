# Test results

Ran 19 checks against the local PostgreSQL and MongoDB databases.

| Check | Result | Detail |
| --- | --- | --- |
| Embedding ranks cabin rust above a clean car | Pass | city 0.560 vs seltos -0.098 |
| Rejects a VIN containing I | Pass | new row for relation "vehicles" violates check constraint "vehicles_vin_check" |
| Rejects an odometer decrease | Pass | Odometer cannot decrease (62400 km recorded, 62399 km submitted) |
| Rejects a failed checkpoint with no severity | Pass | A failed checkpoint cannot have severity none |
| Refuses to delete a completed inspection | Pass | Completed inspections cannot be deleted; void them instead |
| Refuses to deactivate the last admin | Pass | The last active admin cannot be deactivated |
| Rolled-back insert does not keep the bad user | Pass | 4 users |
| Fleet view has high, low, fair, and unpriced asks | Pass | fair:4, overpriced:3, underpriced:2, unpriced:1 |
| Vector search leads with the City for a corrosion paraphrase | Pass | City 0.560, Innova 0.264, City 0.174 |
| Full-text misses the corrosion paraphrase | Pass | 0 hits |
| Full-text finds damp footwell on the City summary | Pass | City |
| HAVING keeps makes above the repair threshold | Pass | 3 makes |
| Passwords are bcrypt hashes | Pass | 4 accounts |
| Grade function boundaries | Pass | {"a":"A","b":"B","f":"F"} |
| Stored procedure records an uninspected residual | Pass | uninspected_prior |
| Mongo text index misses the corrosion paraphrase | Pass | 0 hits |
| Mongo aggregation groups dossiers by city | Pass | Bengaluru:5, Chennai:3, Hyderabad:2 |
| Mongo text index finds the Creta narrative | Pass | MAHYCR18JX1234502 |
| Audit trigger wrote vehicle history | Pass | 20 rows |

All checks passed.
