import React from "react";
import { Order } from "../../types";
import { formatLargeNumber } from "../../lib/formatters";

interface CountersellOrdersTableProps {
  orders: Order[];
  onCancelOrder: (orderId: string) => void;
  cancellingOrderId?: string | null;
}

const CountersellOrdersTable: React.FC<CountersellOrdersTableProps> = ({ 
  orders, 
  onCancelOrder, 
  cancellingOrderId 
}) => {
  if (orders.length === 0) {
    return <p>No active orders.</p>;
  }

  return (
    <div className="countersell-table-container">
      <table className="countersell-table" role="grid">
        <thead>
          <tr>
            <th>Tokens Sold</th>
            <th>Max Tokens to Sell</th>
            <th>Target MC</th>
            <th>Triggering Buy</th>
            <th>Countersell %</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} id={`order-${order.id}`}>
              <td>{order.tokensSold ? formatLargeNumber(order.tokensSold.amount) : '0'}</td>
              <td>{order.maxTokensToSell ? formatLargeNumber(order.maxTokensToSell) : '0'}</td>
              <td>
                {order.targetMcap ? order.targetMcap.valueSol.toLocaleString() : '0'} SOL
              </td>
              <td>
                {order.triggeringBuy ? order.triggeringBuy.valueSol.toLocaleString() : '0'} SOL
              </td>
              <td>{order.sellPercentage ? `${(order.sellPercentage / 100).toFixed(2)}%` : '0%'}</td>
              <td>
                <button
                  onClick={() => onCancelOrder(order.id)}
                  disabled={cancellingOrderId === order.id}
                  className="order-cancel-button"
                >
                  {cancellingOrderId === order.id ? 'Cancelling...' : 'Cancel'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default CountersellOrdersTable;
