import React from "react";
import { PiWallet as WalletIcon } from "react-icons/pi";
import { IoCopy, IoCheckmark } from "react-icons/io5";

interface WalletInfoProps {
  balance?: number;
  publicKey?: string;
  size?: "normal" | "condensed";
  variant?: "default" | "error" | "success";
  onCopyAddress?: (address: string) => void;
  copied?: boolean;
  className?: string;
  color?: string;
}

const WalletInfo: React.FC<WalletInfoProps> = ({
  balance,
  publicKey,
  size = "normal",
  variant = "default",
  onCopyAddress,
  copied = false,
  className = "",
  color,
}) => {
  const displayBalance = balance !== undefined ? balance.toFixed(2) : "loading";
  const showAddress = size === "normal" && publicKey;
  
  return (
    <div className={`wallet-info wallet-info--${size} wallet-info--${variant} ${className}`}>
      {/* Wallet Balance Element */}
      <div className="wallet-balance">
        <WalletIcon className="wallet-balance__icon" size={size === "condensed" ? 16 : 18} />
        <span 
          className="wallet-balance__amount"
          style={{ color: color || undefined }}
        >
          {displayBalance} SOL
        </span>
      </div>
      
      {/* Wallet Address Element (only shown in normal size) */}
      {showAddress && (
        <div className="wallet-address">
          <span className="wallet-address__text">
            {publicKey.slice(0, 4)}
          </span>
          <button
            onClick={() => onCopyAddress?.(publicKey)}
            className={`wallet-address__copy-btn ${copied ? 'wallet-address__copy-btn--copied' : ''}`}
            title="Copy wallet address"
          >
            {copied ? <IoCheckmark size={14} /> : <IoCopy size={10} />}
          </button>
        </div>
      )}
    </div>
  );
};

export default WalletInfo;
