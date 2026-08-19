import React from "react";

interface CurrencyToggleProps {
  currency: "USD" | "SOL";
  onCurrencyChange: (currency: "USD" | "SOL") => void;
  className?: string;
}

const CurrencyToggle: React.FC<CurrencyToggleProps> = ({
  currency,
  onCurrencyChange,
  className = "",
}) => {
  return (
    <div className={`currency-toggle ${className}`}>
      <button
        type="button"
        className={`btn btn--tertiary ${currency === "USD" ? "currency-toggle__button--active" : ""}`}
        onClick={() => onCurrencyChange("USD")}
      >
        USD
      </button>
      <span className="currency-toggle__separator">/</span>
      <button
        type="button"
        className={`btn btn--tertiary ${currency === "SOL" ? "currency-toggle__button--active" : ""}`}
        onClick={() => onCurrencyChange("SOL")}
      >
        SOL
      </button>
    </div>
  );
};

export default CurrencyToggle;
