import React from "react";
import { FiTerminal as TerminalIcon } from "react-icons/fi";
import { Order, Holding } from "../../types";
import { formatAge } from "../../lib/formatters";
import OrderDetails from "./OrderDetails";
import Logs from "./Logs";
import "../../styles/components/all-orders-list.css";

interface OrderHistoryProps {
  orders: Order[];
  tokenInfo?: Holding;
  expandedOrderLogs: Set<string>;
  onToggleOrderLogs: (orderId: string) => void;
  allLogs: Array<{
    level: string;
    message: string;
    timestamp: string;
    order_id?: number;
  }>;
}

const OrderHistory: React.FC<OrderHistoryProps> = ({ 
  orders, 
  tokenInfo, 
  expandedOrderLogs, 
  onToggleOrderLogs,
  allLogs
}) => {
  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "active":
        return "status-active";
      case "completed":
        return "status-completed";
      case "failed":
        return "status-failed";
      case "deleted":
      case "cancelled":
        return "status-cancelled";
      case "created":
      case "submitted":
        return "status-pending";
      default:
        return "status-unknown";
    }
  };

  if (orders.length === 0) {
    return <p>No orders found.</p>;
  }

  return (
    <>
      {orders.map((order) => {
        const isLogsExpanded = expandedOrderLogs.has(order.id);
        
        return (
          <div key={order.id} id={`order-${order.id}`} className="historical-order">
            <div className="historical-order__content">
              <div className="order-details-grid">
                <div className="order-detail-field">
                  <div className="order-detail-label">Order Type</div>
                  <div className="order-detail-value">{order.type}</div>
                </div>
                <div className="order-detail-field">
                  <div className="order-detail-label">Status</div>
                  <div className="order-detail-value">
                    <span className={`all-orders-item__status-badge ${getStatusColor(order.status)}`}>
                      {order.status}
                    </span>
                  </div>
                </div>
                <OrderDetails order={order} tokenSymbol={tokenInfo?.symbol} />
                {order.type === "OneShotBuy" || order.type === "OneShotSell" ? (
                  <div className="order-detail-field">
                    <div className="order-detail-label">Age</div>
                    <div className="order-detail-value">
                      {formatAge(order.createdAt)}
                    </div>
                  </div>
                ) : null}
                <div className="order-detail-field order-logs-field">
                  <button
                    onClick={() => onToggleOrderLogs(order.id)}
                    className="order-logs-button"
                    title={isLogsExpanded ? "Hide Logs" : "Show Logs"}
                  >
                    <TerminalIcon size={16} />
                    <span>{isLogsExpanded ? "Hide" : "Logs"}</span>
                  </button>
                </div>
              </div>
              {isLogsExpanded && (
                <div className="historical-order__logs">
                  <Logs 
                    logs={allLogs.filter(log => log.order_id?.toString() === order.id)} 
                    orderIdToIndex={orders.reduce((acc, o, index) => {
                      acc[o.id] = index + 1;
                      return acc;
                    }, {} as Record<string, number>)}
                    hasWelcomeLogs={false}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
};

export default OrderHistory;
