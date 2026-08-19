import React, { useRef, useEffect } from "react";
import { WalletSolResponse } from "../../types";
import SmartInput from "./SmartInput";
import BuySellButton from "./BuySellButton";
import HoldingsInfo from "../wallet/HoldingsInfo";

interface SellFormProps {
  onSubmit: (e: React.FormEvent) => void;
  amountToSell: string;
  setAmountToSell: (value: string) => void;
  solBalanceData?: WalletSolResponse;
  isBalanceInsufficient: boolean;
  isPending: boolean;
  sellError: string | null;
  orderError: string | null;
  tokenSymbol?: string;
  tokenBalance?: number;
  isActive: boolean;
  walletData?: { publicKey: string };
}

const SellForm: React.FC<SellFormProps> = ({
  onSubmit,
  amountToSell,
  setAmountToSell,
  solBalanceData,
  isBalanceInsufficient,
  isPending,
  sellError,
  orderError,
  tokenSymbol,
  tokenBalance,
  isActive,
  walletData,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isActive && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isActive]);

  const handleSmartInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmountToSell(e.target.value);
  };

  const handlePresetClick = (value: string | number) => {
    const percentage = typeof value === 'string' 
      ? parseFloat(value.replace('%', '')) 
      : value;
    if (tokenBalance && !isNaN(percentage)) {
      const amount = tokenBalance * (percentage / 100);
      setAmountToSell(amount.toString());
    }
  };

  return (
    <>
      <form onSubmit={onSubmit} className="buy-sell-form">
        <SmartInput
          name="amountToSell"
          value={amountToSell}
          onChange={handleSmartInputChange}
          suffix={tokenSymbol || ""}
          mode="presets"
          prefix="AMOUNT"
          presetValues={["25%", "50%", "75%", "100%"]}
          onPresetClick={handlePresetClick}
          required
          isError={isBalanceInsufficient}
        />
        <div className="buy-sell-form__footer">
          <BuySellButton
            type="sell"
            isPending={isPending}
            isDisabled={isBalanceInsufficient || !amountToSell || isPending}
            tokenSymbol={tokenSymbol}
            amount={amountToSell}
          />
          {isBalanceInsufficient && (
            <p className="buy-sell-form__error">insufficient token balance</p>
          )}
          {sellError && <p className="buy-sell-form__error">{sellError}</p>}
          {orderError && <p className="buy-sell-form__error">{orderError}</p>}
        </div>
        <div className="buy-sell-form__row">
          <HoldingsInfo
            solBalanceData={solBalanceData}
            tokenBalance={tokenBalance}
            tokenSymbol={tokenSymbol}
            isBalanceInsufficient={isBalanceInsufficient}
            walletData={walletData}
          />
        </div>
      </form>
    </>
  );
};

export default SellForm;
