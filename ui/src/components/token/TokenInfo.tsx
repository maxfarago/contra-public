import React from "react";
import { useNavigate } from "react-router-dom";
import { IoCheckmark, IoCopy, IoArrowForward } from "react-icons/io5";
import { Holding } from "../../types";
import { formatLargeNumber, formatPriceWithSubscript } from "../../lib/formatters";
import ProtocolIcon from "../shared/ProtocolIcon";
import { useCurrency } from "../../contexts/CurrencyContext";

interface TokenInfoProps {
  tokenInfo: Holding;
  priceColor: string;
  copied: boolean;
  onCopy: (text: string) => void;
  showCopyButton?: boolean;
  variant?: "default" | "portfolio";
}

const TokenInfo: React.FC<TokenInfoProps> = ({
  tokenInfo,
  priceColor,
  copied,
  onCopy,
  showCopyButton = true,
  variant = "default",
}) => {
  const { currency } = useCurrency();
  const navigate = useNavigate();

  const getImageClass = () => {
    const source = tokenInfo.source?.toLowerCase();
    if (source === "pump_fun") return "token-info__image--pump-fun";
    if (source === "pump_amm") return "token-info__image--pump-amm";
    return "token-info__image";
  };

  const getPriceClass = () => {
    if (priceColor === "#4CAF50") return "token-info__price--positive";
    if (priceColor === "#ff6b6b") return "token-info__price--negative";
    return "token-info__price";
  };

  const getMarketCapClass = () => {
    if (priceColor === "#4CAF50") return "token-info__market-cap--positive";
    if (priceColor === "#ff6b6b") return "token-info__market-cap--negative";
    return "token-info__market-cap";
  };

  const formatMarketCap = () => {
    if (!tokenInfo.market_cap) return "-";
    const value = currency === "USD" 
      ? tokenInfo.market_cap.valueUsd
      : tokenInfo.market_cap.valueSol;
    if (value === undefined || value === null) return "-";
    const prefix = currency === "USD" ? "$" : "";
    const suffix = currency === "SOL" ? " SOL" : "";
    return `${prefix}${formatLargeNumber(value)}${suffix}`;
  };

  const formatVolume = () => {
    if (!tokenInfo.volume_24h) return "-";
    const value = currency === "USD" 
      ? tokenInfo.volume_24h.valueUsd
      : tokenInfo.volume_24h.valueSol;
    if (value === undefined || value === null) return "-";
    const prefix = currency === "USD" ? "$" : "";
    const suffix = currency === "SOL" ? " SOL" : "";
    return `${prefix}${formatLargeNumber(value)}${suffix}`;
  };

  const formatLiquidity = () => {
    if (!tokenInfo.liquidity) return "-";
    const value = currency === "USD" 
      ? tokenInfo.liquidity.valueUsd
      : tokenInfo.liquidity.valueSol;
    if (value === undefined || value === null) return "-";
    const prefix = currency === "USD" ? "$" : "";
    const suffix = currency === "SOL" ? " SOL" : "";
    return `${prefix}${formatLargeNumber(value)}${suffix}`;
  };

  const formatPrice = () => {
    if (!tokenInfo.price_info) return "-";
    const price = currency === "USD" 
      ? tokenInfo.price_info.price_usd || 0
      : tokenInfo.price_info.price_per_token;
    if (price === undefined || price === null) return "-";
    const prefix = currency === "USD" ? "$" : "";
    const suffix = currency === "SOL" ? " SOL" : "";
    return `${prefix}${formatPriceWithSubscript(price)}${suffix}`;
  };

  if (variant === "portfolio") {
    return (
      <article className="token-info token-info--portfolio">
        {/* Column 1: Token Image */}
        <div className="token-info__image-column">
          <img
            src={tokenInfo.image}
            alt={tokenInfo.name}
            className={getImageClass()}
            style={{
              width: '48px',
              height: '48px',
              objectFit: 'cover',
              border: '2px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)'
            }}
          />
        </div>

        {/* Column 2: Token Identity */}
        <div className="token-info__identity-column">
          {/* Top Row: Symbol + Name */}
          <div className="token-info__top-row">
            <h4 className="token-info__symbol">
              {tokenInfo.symbol}
            </h4>
            <div style={{ display: 'flex', gap: 'var(--space-1)', alignItems: 'center' }}>
              <ProtocolIcon source={tokenInfo.source} />
              {tokenInfo.is_mayhem_mode && (
                <img src="/icons/mayhem.svg" alt="Mayhem Token" className="mayhem-icon" style={{ width: '14px', height: '14px' }}/>
              )}
            </div>
            <span className="token-info__name">
              {tokenInfo.name}
            </span>
          </div>
          
          {/* Bottom Row: Address + Copy Button */}
          <div className="token-info__bottom-row">
            <span className="token-info__address">
              {tokenInfo.address.slice(0, 4)}...{tokenInfo.address.slice(-4)}
            </span>
            {showCopyButton && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCopy(tokenInfo.address);
                }}
                className={`token-info__copy-button ${copied ? 'token-info__copy-button--copied' : ''}`}
                title="Copy wallet address"
              >
                {copied ? <IoCheckmark size={14} /> : <IoCopy size={12} />}
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/portfolio/${tokenInfo.address}`);
              }}
              className="token-info__nav-button"
              title="Go to token page"
            >
              <IoArrowForward size={14} />
            </button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="token-info">
      {/* Column 1: Token Image */}
      <div className="token-info__image-column">
        <img
          src={tokenInfo.image}
          alt={tokenInfo.name}
          className={getImageClass()}
          style={{
            width: '48px',
            height: '48px',
            objectFit: 'cover',
            border: '2px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)'
          }}
        />
      </div>

      {/* Column 2: Token Identity */}
      <div className="token-info__identity-column">
        {/* Top Row: Symbol + Name */}
        <div className="token-info__top-row">
          <h4 className="token-info__symbol">
            {tokenInfo.symbol}
          </h4>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <ProtocolIcon source={tokenInfo.source} />
            {tokenInfo.is_mayhem_mode && (
              <img src="/icons/mayhem.svg" alt="Mayhem Token" className="mayhem-icon" style={{ width: '14px', height: '14px' }}/>
            )}
          </div>
          <span className="token-info__name">
            {tokenInfo.name}
          </span>
        </div>
        
        {/* Bottom Row: Address + Copy Button */}
        <div className="token-info__bottom-row">
          <span className="token-info__address">
            {tokenInfo.address.slice(0, 4)}...{tokenInfo.address.slice(-4)}
          </span>
          {showCopyButton && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCopy(tokenInfo.address);
              }}
              className={`token-info__copy-button ${copied ? 'token-info__copy-button--copied' : ''}`}
              title="Copy wallet address"
            >
              {copied ? <IoCheckmark size={14} /> : <IoCopy size={10} />}
            </button>
          )}
        </div>
        
        {/* Metrics Row: Four Metrics Side by Side */}
        <div className="token-info__metrics-row">
          <div className="token-info__metric">
            <span className="token-info__metric-label">MC</span>
            <span className={getMarketCapClass()}>
              {formatMarketCap()}
            </span>
          </div>
          <div className="token-info__metric">
            <span className="token-info__metric-label">PRICE</span>
            <span className={getPriceClass()}>
              {formatPrice()}
            </span>
          </div>
          <div className="token-info__metric">
            <span className="token-info__metric-label">VOL</span>
            <span className="token-info__metric-value">
              {formatVolume()}
            </span>
          </div>
          <div className="token-info__metric">
            <span className="token-info__metric-label">LIQ</span>
            <span className="token-info__metric-value">
              {formatLiquidity()}
            </span>
          </div>
        </div>
      </div>

    </article>
  );
};

export default TokenInfo;
