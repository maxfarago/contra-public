import React, { useRef, useEffect } from "react";
import { WalletSolResponse } from "../../types";
import SmartInput from "./SmartInput";
import BuySellButton from "./BuySellButton";
import HoldingsInfo from "../wallet/HoldingsInfo";

interface BuyFormProps {
  onSubmit: (e: React.FormEvent) => void;
  amountToBuy: string;
  setAmountToBuy: (value: string) => void;
  solBalanceData?: WalletSolResponse;
  isBalanceInsufficient: boolean;
  isPending: boolean;
  buyError: string | null;
  orderError: string | null;
  estimatedTokens: number | null;
  tokenSymbol?: string;
  isActive: boolean;
  tokenBalance?: number;
  walletData?: { publicKey: string };
}

const BuyForm: React.FC<BuyFormProps> = ({
  onSubmit,
  amountToBuy,
  setAmountToBuy,
  solBalanceData,
  isBalanceInsufficient,
  isPending,
  buyError,
  orderError,
  estimatedTokens,
  tokenSymbol,
  isActive,
  tokenBalance,
  walletData,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isActive && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isActive]);

  return (
    <>
      <form onSubmit={onSubmit} className="buy-sell-form">
        <SmartInput
          name="amountToBuy"
          value={amountToBuy}
          onChange={(e) => setAmountToBuy(e.target.value)}
          suffix="SOL"
          mode="presets"
          prefix="AMOUNT"
          presetValues={[0.01, 0.1, 0.5, 1]}
          required
          isError={isBalanceInsufficient}
        />
        <div className="buy-sell-form__footer">
          <BuySellButton
            type="buy"
            isPending={isPending}
            isDisabled={isBalanceInsufficient || !amountToBuy || isPending}
            tokenSymbol={tokenSymbol}
            amount={amountToBuy}
            estimatedTokens={estimatedTokens}
          />
          {isBalanceInsufficient && (
            <p className="buy-sell-form__error">insufficient sol balance</p>
          )}
          {buyError && <p className="buy-sell-form__error">{buyError}</p>}
          {orderError && <p className="buy-sell-form__error">{orderError}</p>}
        </div>
        <HoldingsInfo
          solBalanceData={solBalanceData}
          tokenBalance={tokenBalance}
          tokenSymbol={tokenSymbol}
          isBalanceInsufficient={isBalanceInsufficient}
          walletData={walletData}
        />
      </form>
    </>
  );
};

export default BuyForm;
