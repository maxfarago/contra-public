import React, { useState, useEffect, useRef } from "react";
import { WalletSolResponse, Holding } from "../../types";
import WalletInfo from "./WalletInfo";
import DepositModal from "./DepositModal";
import { formatLargeNumber } from "../../lib/formatters";
import { IoAdd } from "react-icons/io5";

interface HoldingsInfoProps {
  solBalanceData?: WalletSolResponse;
  tokenBalance?: number;
  tokenSymbol?: string;
  isBalanceInsufficient: boolean;
  walletData?: { publicKey: string };
}

const HoldingsInfo: React.FC<HoldingsInfoProps> = ({
  solBalanceData,
  tokenBalance,
  tokenSymbol,
  isBalanceInsufficient,
  walletData,
}) => {
  const [tokenColor, setTokenColor] = useState("var(--color-text-muted)");
  const [solColor, setSolColor] = useState("var(--color-text)");
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const prevTokenBalanceRef = useRef<number>();
  const prevSolBalanceRef = useRef<number>();

  // Token balance flash effect
  useEffect(() => {
    if (tokenBalance !== undefined) {
      const currentBalance = tokenBalance;
      const prevBalance = prevTokenBalanceRef.current;
      if (prevBalance !== undefined && currentBalance !== prevBalance) {
        const newColor = currentBalance > prevBalance ? "var(--color-buy-bright) !important" : "var(--color-sell-bright) !important";
        setTokenColor(newColor);
        const timer = setTimeout(() => setTokenColor("var(--color-text-muted)"), 1500);
        return () => clearTimeout(timer);
      }
      prevTokenBalanceRef.current = currentBalance;
    }
  }, [tokenBalance]);

  // SOL balance flash effect
  useEffect(() => {
    if (solBalanceData?.balance !== undefined) {
      const currentBalance = solBalanceData.balance;
      const prevBalance = prevSolBalanceRef.current;
      if (prevBalance !== undefined && currentBalance !== prevBalance) {
        const newColor = currentBalance > prevBalance ? "var(--color-buy-bright)" : "var(--color-sell-bright)";
        setSolColor(newColor);
        const timer = setTimeout(() => setSolColor("var(--color-text)"), 1500);
        return () => clearTimeout(timer);
      }
      prevSolBalanceRef.current = currentBalance;
    }
  }, [solBalanceData?.balance]);

  return (
    <>
      <div className="holdings-info">
        <button
          className="holdings-info__deposit-button"
          onClick={() => setIsDepositModalOpen(true)}
          type="button"
        >
          <IoAdd size={12} className="holdings-info__deposit-icon" />
          Deposit
        </button>
        
        {tokenSymbol && (
          <div className="holdings-info__token">
            <span 
              className="holdings-info__token-amount"
              style={{ color: tokenColor }}
            >
              {formatLargeNumber(tokenBalance || 0)}
            </span>
            <span 
              className="holdings-info__token-symbol"
              style={{ color: tokenColor }}
            >
              {tokenSymbol}
            </span>
          </div>
        )}
        <WalletInfo
          balance={solBalanceData?.balance}
          size="condensed"
          variant={isBalanceInsufficient ? "error" : "default"}
          color={solColor}
        />
      </div>

      <DepositModal
        isOpen={isDepositModalOpen}
        onClose={() => setIsDepositModalOpen(false)}
        publicKey={walletData?.publicKey || ""}
      />
    </>
  );
};

export default HoldingsInfo;
