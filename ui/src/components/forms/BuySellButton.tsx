import React from "react";
import { formatLargeNumber } from "../../lib/formatters";

interface BuySellButtonProps {
  type: "buy" | "sell";
  isPending: boolean;
  isDisabled: boolean;
  tokenSymbol?: string;
  amount?: string | number;
  estimatedTokens?: number | null; // Only used for buy
  className?: string;
  overrideLabel?: string;
}

const BuySellButton: React.FC<BuySellButtonProps> = ({
  type,
  isPending,
  isDisabled,
  tokenSymbol,
  amount,
  estimatedTokens,
  className = "",
  overrideLabel,
}) => {
  const getButtonText = () => {
    if (overrideLabel) {
      return overrideLabel;
    }
    if (isPending) {
      return "Submitting...";
    }

    if (type === "buy") {
      if (estimatedTokens) {
        return `Buy ~${formatLargeNumber(estimatedTokens)} $${tokenSymbol}`;
      }
      return `Buy $${tokenSymbol}`;
    } else {
      // Sell
      if (amount) {
        return `Sell ${formatLargeNumber(Number(amount))} $${tokenSymbol}`;
      }
      return `Sell $${tokenSymbol}`;
    }
  };

  return (
    <button
      type="submit"
      className={`buy-sell-button buy-sell-button--${type} ${overrideLabel ? "buy-sell-button--error" : ""} ${className}`}
      disabled={isDisabled}
      aria-busy={isPending}
    >
      {getButtonText()}
    </button>
  );
};

export default BuySellButton;
