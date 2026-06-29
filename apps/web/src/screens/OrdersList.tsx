import { useOrders } from '../hooks/useOrders';
import { Money } from '../components/Money';
import { displayStatus, refundedCents } from '../lib/orders';

/**
 * Orders list with loading / error / empty / data states. Each row links to the order detail
 * view via `onSelect`; per-order actions (line items, refunds) live in OrderDetail.
 */
export function OrdersList({ onSelect }: { onSelect?: (orderId: string) => void }) {
  const { data, loading, error, reload } = useOrders();

  if (loading) {
    return <p>Loading orders...</p>;
  }

  if (error) {
    return (
      <div role="alert">
        Could not load orders: {error} <button onClick={reload}>Retry</button>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <p>No orders yet.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th align="left">Order</th>
          <th align="left">Status</th>
          <th align="left">Total</th>
          <th align="left">Refunded</th>
          <th align="left"></th>
        </tr>
      </thead>
      <tbody>
        {data.map((order) => (
          <tr key={order.id}>
            <td>{order.id.slice(0, 8)}</td>
            <td>{displayStatus(order)}</td>
            <td>
              <Money cents={order.total_cents} />
            </td>
            <td>
              <Money cents={refundedCents(order)} />
            </td>
            <td>
              <button onClick={() => onSelect?.(order.id)}>View</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
