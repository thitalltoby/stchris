export interface ItemRow { id: string; label: string; unit: string; quantity: { toString(): string }; sku: string | null; note: string | null }

/** The lines a customer asked for, as they were when the request was sent. */
export function RequestItemsTable({ items, showSku = false }: { items: ItemRow[]; showSku?: boolean }) {
  return (
    <div className="table-wrap">
      <table className="dt">
        <caption className="sr-only">Items requested</caption>
        <thead><tr><th scope="col">Item</th>{showSku && <th scope="col">SKU</th>}<th scope="col" className="num">Quantity</th><th scope="col">Unit</th></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td>{i.label}{i.note && <span className="block text-sm text-steel">{i.note}</span>}</td>
              {showSku && <td className="mono text-sm">{i.sku ?? '—'}</td>}
              <td className="num">{i.quantity.toString()}</td>
              <td>{i.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
