import React from 'react';
import { AtlasHoldingInfo } from './types';
import { formatCurrency, formatLargeNumber } from '../../lib/formatters';
import { useCurrency } from '../../contexts/CurrencyContext';
import { FaArrowTrendUp, FaArrowTrendDown } from "react-icons/fa6";

interface AtlasHoldingsInfoProps {
  holding: AtlasHoldingInfo;
  className?: string;
}

const AtlasHoldingsInfo: React.FC<AtlasHoldingsInfoProps> = ({ holding, className = '' }) => {
  const { currency } = useCurrency();

  const pnlPercent = holding.pnl_percent;
  const currentValue = currency === 'USD' ? holding.current_value_usd : holding.current_value_sol;
  const isProfit = pnlPercent >= 0;
  const pnlColor = isProfit ? '#4CAF50' : '#ff6b6b';

  return (
    <div className={`atlas-holdings-info ${className}`}>
      <div className="hud-item">
        <span className="hud-label">Quantity</span>
        <span className="hud-value">{formatLargeNumber(holding.quantity)}</span>
      </div>
      <div className="hud-item">
        <span className="hud-label">Value</span>
        <span className="hud-value">{formatCurrency(currentValue, currency)}</span>
      </div>
      <div className="hud-item">
        <span className="hud-label">PnL</span>
        <span className="hud-value" style={{ color: pnlColor, display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
          {isProfit ? <FaArrowTrendUp /> : <FaArrowTrendDown />}
          {pnlPercent === null || pnlPercent === undefined || isNaN(pnlPercent)
            ? "--"
            : `${Math.abs(pnlPercent).toFixed(1)}%`}
        </span>
      </div>
    </div>
  );
};

export default AtlasHoldingsInfo;
