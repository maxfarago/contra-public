import React from "react";
import { Order } from "../../types";
import { formatLargeNumber } from "../../lib/formatters";

interface OrderDetailsProps {
  order: Order;
  tokenSymbol?: string;
}

const OrderDetails: React.FC<OrderDetailsProps> = ({ order, tokenSymbol }) => {
  if (order.type === "OneShotBuy" || order.type === "OneShotSell") {
    const tokens = order.tokens;
    const sol = order.sol;
    
    return (
      <>
        <div className="order-detail-field">
          <div className="order-detail-label">Tokens</div>
          <div className="order-detail-value">
            {tokens ? formatLargeNumber(tokens.amount) : '0'} {tokenSymbol}
          </div>
        </div>
        <div className="order-detail-field">
          <div className="order-detail-label">USD Value</div>
          <div className="order-detail-value">
            {sol ? `$${sol.valueUsd.toFixed(2)}` : '$0.00'}
          </div>
        </div>
        <div className="order-detail-field">
          <div className="order-detail-label">SOL Amount</div>
          <div className="order-detail-value">
            {sol ? `${sol.amount.toFixed(6)} SOL` : '0 SOL'}
          </div>
        </div>
      </>
    );
  }

  // Countersell order details
  return (
    <>
      <div className="order-detail-field">
        <div className="order-detail-label">Tokens Sold</div>
        <div className="order-detail-value">
          {order.tokensSold ? formatLargeNumber(order.tokensSold.amount) : '0'} {tokenSymbol}
        </div>
      </div>
      <div className="order-detail-field">
        <div className="order-detail-label">Max to Sell</div>
        <div className="order-detail-value">
          {order.maxTokensToSell ? formatLargeNumber(order.maxTokensToSell) : '0'} {tokenSymbol}
        </div>
      </div>
      <div className="order-detail-field">
        <div className="order-detail-label">Target MCap</div>
        <div className="order-detail-value">
          {order.targetMcap ? `${order.targetMcap.valueSol} SOL` : '0 SOL'}
        </div>
      </div>
      <div className="order-detail-field">
        <div className="order-detail-label">Triggering Buy</div>
        <div className="order-detail-value">
          {order.triggeringBuy ? `${order.triggeringBuy.valueSol} SOL` : '0 SOL'}
        </div>
      </div>
      <div className="order-detail-field">
        <div className="order-detail-label">Countersell %</div>
        <div className="order-detail-value">
          {order.sellPercentage ? `${(order.sellPercentage / 100).toFixed(2)}%` : '0%'}
        </div>
      </div>
    </>
  );
};

export default OrderDetails;
