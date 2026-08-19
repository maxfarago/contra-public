import React from "react";

interface BuySellToggleProps {
  activeMode: "buy" | "sell";
  onModeChange: (mode: "buy" | "sell") => void;
  className?: string;
}

const BuySellToggle: React.FC<BuySellToggleProps> = ({
  activeMode,
  onModeChange,
  className = "",
}) => {
  return (
    <div className={`buy-sell-toggle ${className}`}>
      <button
        type="button"
        className={`buy-sell-toggle__button buy-sell-toggle__button--buy ${
          activeMode === "buy" ? "buy-sell-toggle__button--active" : ""
        }`}
        onClick={() => onModeChange("buy")}
      >
        Buy
      </button>
      <button
        type="button"
        className={`buy-sell-toggle__button buy-sell-toggle__button--sell ${
          activeMode === "sell" ? "buy-sell-toggle__button--active" : ""
        }`}
        onClick={() => onModeChange("sell")}
      >
        Sell
      </button>
    </div>
  );
};

export default BuySellToggle;
