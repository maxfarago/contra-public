import React from "react";
import { Order } from "../../types";
import { formatLargeNumber, formatAge } from "../../lib/formatters";
import { useCurrency } from "../../contexts/CurrencyContext";
import TokenInfo from "../token/TokenInfo";

interface AllOrdersListProps {
  orders: Order[];
  isLoading: boolean;
  error?: Error;
}

const AllOrdersList: React.FC<AllOrdersListProps> = ({ 
  orders, 
  isLoading, 
  error 
}) => {
  const { currency } = useCurrency();

  if (isLoading) {
    return <div className="all-orders-loading">Loading orders...</div>;
  }

  if (error) {
    return (
      <div className="all-orders-error">
        <p>Failed to load orders. Please try again.</p>
        <button 
          onClick={() => window.location.reload()} 
          className="all-orders-retry-button"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return <p className="all-orders-empty">No orders found.</p>;
  }

  const formatCurrencyValue = (valueUsd: number, valueSol: number) => {
    const value = currency === "USD" ? valueUsd : valueSol;
    const prefix = currency === "USD" ? "$" : "";
    const suffix = currency === "SOL" ? " SOL" : "";
    return `${prefix}${formatLargeNumber(value)}${suffix}`;
  };

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

  return (
    <div className="all-orders-container">
      {orders.map((order) => (
        <div key={order.id} className="all-orders-item">
          <div className="all-orders-item__row">
            {/* Token Column */}
            <div className="all-orders-item__column all-orders-item__column--token">
              <TokenInfo
                tokenInfo={{
                  name: order.token.name,
                  symbol: order.token.symbol,
                  address: order.token.mint,
                  image: order.token.imageUrl,
                  price_info: { price_per_token: 0 },
                  market_cap: { valueUsd: 0, valueSol: 0 },
                  balance: 0,
                  rawBalance: 0
                }}
                variant="portfolio"
                priceColor="white"
                copied={false}
                onCopy={() => {}}
                showCopyButton={false}
              />
            </div>

            {/* Status Column */}
            <div className="all-orders-item__column all-orders-item__column--status">
              <div className="all-orders-item__detail-row">
                <span className="all-orders-item__detail-label">Status</span>
                <span className={`all-orders-item__status-badge ${getStatusColor(order.status)}`}>
                  {order.status}
                </span>
              </div>
            </div>

            {/* Type Column */}
            <div className="all-orders-item__column all-orders-item__column--type">
              <div className="all-orders-item__detail-row">
                <span className="all-orders-item__detail-label">Type</span>
                <span className="all-orders-item__detail-value">{order.type}</span>
              </div>
            </div>

            {/* OneShot Order Columns */}
            {(order.type === "OneShotBuy" || order.type === "OneShotSell") && (
              <>
                {order.sol && (
                  <div className="all-orders-item__column all-orders-item__column--sol-amount">
                    <div className="all-orders-item__detail-row">
                      <span className="all-orders-item__detail-label">SOL Amount</span>
                      <span className="all-orders-item__detail-value">
                        {formatLargeNumber(order.sol.amount)}
                      </span>
                    </div>
                  </div>
                )}
                {order.tokens && (
                  <div className="all-orders-item__column all-orders-item__column--tokens">
                    <div className="all-orders-item__detail-row">
                      <span className="all-orders-item__detail-label">Tokens</span>
                      <span className="all-orders-item__detail-value">
                        {formatLargeNumber(order.tokens.amount)} {order.token.symbol}
                      </span>
                    </div>
                  </div>
                )}
                {order.sol && (
                  <div className="all-orders-item__column all-orders-item__column--value">
                    <div className="all-orders-item__detail-row">
                      <span className="all-orders-item__detail-label">Value</span>
                      <span className="all-orders-item__detail-value">
                        {currency === "USD" 
                          ? `$${formatLargeNumber(order.sol.valueUsd)}` 
                          : `${formatLargeNumber(order.sol.amount)} SOL`
                        }
                      </span>
                    </div>
                  </div>
                )}

                {/* Created Column */}
                <div className="all-orders-item__column all-orders-item__column--created">
                  <div className="all-orders-item__detail-row">
                    <span className="all-orders-item__detail-label">Created</span>
                    <span className="all-orders-item__detail-value">{formatAge(order.createdAt)}</span>
                  </div>
                </div>
              </>
            )}

            {/* Countersell Order Columns */}
            {order.type === "Countersell" && (
              <>
                {order.tokensSold && (
                  <div className="all-orders-item__column all-orders-item__column--tokens-sold">
                    <div className="all-orders-item__detail-row">
                      <span className="all-orders-item__detail-label">Tokens Sold</span>
                      <span className="all-orders-item__detail-value">
                        {formatLargeNumber(order.tokensSold.amount)} {order.token.symbol}
                      </span>
                    </div>
                  </div>
                )}
                {order.maxTokensToSell && (
                  <div className="all-orders-item__column all-orders-item__column--max-to-sell">
                    <div className="all-orders-item__detail-row">
                      <span className="all-orders-item__detail-label">Max to Sell</span>
                      <span className="all-orders-item__detail-value">
                        {formatLargeNumber(order.maxTokensToSell)} {order.token.symbol}
                      </span>
                    </div>
                  </div>
                )}
                {order.targetMcap && (
                  <div className="all-orders-item__column all-orders-item__column--target-mcap">
                    <div className="all-orders-item__detail-row">
                      <span className="all-orders-item__detail-label">Target MCap</span>
                      <span className="all-orders-item__detail-value">
                        {formatCurrencyValue(order.targetMcap.valueUsd, order.targetMcap.valueSol)}
                      </span>
                    </div>
                  </div>
                )}
                {order.triggeringBuy && (
                  <div className="all-orders-item__column all-orders-item__column--triggering-buy">
                    <div className="all-orders-item__detail-row">
                      <span className="all-orders-item__detail-label">Triggering Buy</span>
                      <span className="all-orders-item__detail-value">
                        {formatCurrencyValue(order.triggeringBuy.valueUsd, order.triggeringBuy.valueSol)}
                      </span>
                    </div>
                  </div>
                )}
                {order.sellPercentage && (
                  <div className="all-orders-item__column all-orders-item__column--sell-percentage">
                    <div className="all-orders-item__detail-row">
                      <span className="all-orders-item__detail-label">Sell %</span>
                      <span className="all-orders-item__detail-value">
                        {(order.sellPercentage / 100).toFixed(2)}%
                      </span>
                    </div>
                  </div>
                )}

                {/* Created Column */}
                <div className="all-orders-item__column all-orders-item__column--created">
                  <div className="all-orders-item__detail-row">
                    <span className="all-orders-item__detail-label">Created</span>
                    <span className="all-orders-item__detail-value">{formatAge(order.createdAt)}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default AllOrdersList;
