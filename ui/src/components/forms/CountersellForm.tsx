import React from "react";
import { Trade, Holding, WalletSolResponse } from "../../types";
import SmartInput from "./SmartInput";
import "../../styles/components/countersell-form.css";

interface OrderState {
  id: number;
  max_percentage_to_sell: string;
  target_mcap_usd: string;
  buy_threshold_sol: string;
  sell_percentage: string;
}

interface CountersellFormProps {
  orders: OrderState[];
  onSubmit: (e: React.FormEvent) => void;
  onOrderChange: (id: number, e: React.ChangeEvent<HTMLInputElement>) => void;
  onPresetClick: (orderId: number, name: string, value: number) => void;
  addOrder: () => void;
  removeOrder: (id: number) => void;
  isPending: boolean;
  isSuccess: boolean;
  isFormIncomplete: boolean;
  newStrategy?: Trade;
  holding: Holding | null;
  tokenBalance?: number;
  solBalanceData?: WalletSolResponse;
  currentMarketCap?: number;
  hasHoldings?: boolean;
  activeOrdersCount?: number;
}

const CountersellForm: React.FC<CountersellFormProps> = ({
  orders,
  onSubmit,
  onOrderChange,
  onPresetClick,
  isPending,
  isFormIncomplete,
  holding,
  tokenBalance,
  currentMarketCap,
  hasHoldings = true,
  activeOrdersCount = 0,
}) => {

  // Success state is handled by the parent component via TanStack Query invalidation
  // The form will be reset and the new order will appear in the Open tab automatically

  const getTooltipContent = (prefix: string) => {
    switch (prefix) {
      case "AMOUNT":
        return "The number of tokens you want to sell when the Countersell order is triggered.";
      case "TARGET MCAP":
        return "Countersell is triggered and starts execution when the target market cap level is reached.";
      case "BUY TX VOL":
        return "The SOL amount of the triggering buy transaction. Countersell activates when a buy of this size or larger occurs.";
      case "COUNTERSELL VOL":
        return "% of the triggering buy to auto-sell. <100% keeps slippage near zero — stealth exit. >100% increases price impact — you start painting the chart.";
      default:
        return `Enter the ${prefix.toLowerCase()} for your transaction`;
    }
  };

  const calculateTokensToSell = (percentage: string) => {
    if (!percentage) return "";
    const percentValue = parseFloat(percentage);
    if (isNaN(percentValue)) return "";
    
    // Use tokenBalance if available, otherwise fall back to holding.balance
    const balance = tokenBalance !== undefined ? tokenBalance : (holding?.balance || 0);
    const symbol = holding?.symbol || "tokens";
    
    const amount = (percentValue / 100) * balance;
    return `~${amount.toLocaleString(undefined, {
      maximumFractionDigits: 4,
    })} ${symbol}`;
  };

  // Check if form should be disabled due to maximum orders reached
  const isMaxOrdersReached = activeOrdersCount >= 4;
  const isFormDisabled = isPending || isFormIncomplete || isMaxOrdersReached;

  return (
    <>
      <form onSubmit={onSubmit} className="countersell-form">
        {orders.map((order) => (
          <fieldset key={order.id} className="countersell-form__fieldset">
            <div className="countersell-form__grid">
              <div className="countersell-form__field">
                <SmartInput
                  name="max_percentage_to_sell"
                  value={order.max_percentage_to_sell}
                  onChange={(e) => onOrderChange(order.id, e)}
                  suffix="%"
                  mode="presets"
                  prefix="AMOUNT"
                  prefixTooltip={getTooltipContent("AMOUNT")}
                  presetValues={[10, 25, 50, 100]}
                  onPresetClick={(value) => onPresetClick(order.id, "max_percentage_to_sell", Number(value))}
                  placeholder="0.0"
                  isError={!hasHoldings}
                  disabled={isMaxOrdersReached}
                />
                {hasHoldings ? (
                  <small className="countersell-form__helper-text">
                    {calculateTokensToSell(order.max_percentage_to_sell)}
                  </small>
                ) : (
                  <small className="countersell-form__error-text">
                    Buy this token to set how much you want to sell
                  </small>
                )}
              </div>
              <div className="countersell-form__field">
                <SmartInput
                  name="target_mcap_usd"
                  value={order.target_mcap_usd}
                  onChange={(e) => onOrderChange(order.id, e)}
                  suffix="$"
                  mode="slider"
                  prefix="TARGET MCAP"
                  prefixTooltip={getTooltipContent("TARGET MCAP")}
                  baseValue={currentMarketCap || 0}
                  placeholder={currentMarketCap ? Math.round(currentMarketCap).toString() : "0"}
                  disabled={isMaxOrdersReached}
                />
              </div>
              <div className="countersell-form__field">
                <SmartInput
                  name="buy_threshold_sol"
                  value={order.buy_threshold_sol}
                  onChange={(e) => onOrderChange(order.id, e)}
                  suffix="SOL"
                  mode="presets"
                  prefix="BUY TX VOL"
                  prefixTooltip={getTooltipContent("BUY TX VOL")}
                  presetValues={[0.05, 0.1, 1, 5]}
                  onPresetClick={(value) => onPresetClick(order.id, "buy_threshold_sol", Number(value))}
                  placeholder="0.0"
                  disabled={isMaxOrdersReached}
                />
              </div>
              <div className="countersell-form__field">
                <SmartInput
                  name="sell_percentage"
                  value={order.sell_percentage}
                  onChange={(e) => onOrderChange(order.id, e)}
                  suffix="%"
                  mode="presets"
                  prefix="COUNTERSELL VOL"
                  prefixTooltip={getTooltipContent("COUNTERSELL VOL")}
                  presetValues={[50, 100, 150, 200]}
                  onPresetClick={(value) => onPresetClick(order.id, "sell_percentage", Number(value))}
                  placeholder="0.0"
                  disabled={isMaxOrdersReached}
                />
              </div>
            </div>
            <div className="countersell-form__actions">
              <button
                type="submit"
                disabled={isFormDisabled}
                aria-busy={isPending}
                className="flex-1"
              >
                {isMaxOrdersReached ? "Maximum Orders Reached" : "Add Scalping Order"}
              </button>
            </div>
          </fieldset>
        ))}
      </form>
    </>
  );
};

export default CountersellForm;
