import { DeleteSaleButton, MarketForm } from "@/components/market/MarketDesk";
import { canWrite, getSession } from "@/lib/auth/guard";
import { listMarket } from "@/lib/admin/desk";
import { listCatalog } from "@/lib/fleet/fleet";
import { inr, km, num, when } from "@/lib/shared/format";

export const metadata = { title: "Market" };

export default async function MarketPage() {
  const [sales, models, user] = await Promise.all([listMarket(), listCatalog(), getSession()]);
  const writer = user ? canWrite(user.role_name) : false;

  return (
    <div className="space-y-6">
      <div>
        <h1>Market</h1>
      </div>
      {writer ? (
        <MarketForm models={models.map((model) => ({ id: model.model_id, label: `${model.make} ${model.model}` }))} />
      ) : null}
      <div className="sheet overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th>Year</th>
              <th>Km</th>
              <th>Price</th>
              <th>Score</th>
              <th>City</th>
              <th>Sold</th>
              <th>Source</th>
              {writer ? <th></th> : null}
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <tr key={sale.sale_id}>
                <td>{sale.make} {sale.model}</td>
                <td>{sale.model_year}</td>
                <td>{km(sale.odometer_km)}</td>
                <td>{inr(sale.sale_price)}</td>
                <td>{num(sale.condition_score, 0)}</td>
                <td>{sale.city}</td>
                <td>{when(sale.sold_on)}</td>
                <td>{sale.source}</td>
                {writer ? <td><DeleteSaleButton saleId={sale.sale_id} /></td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
