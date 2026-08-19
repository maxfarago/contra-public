import { Holding } from '../../types';
import { EnrichedTokenData } from './types';

export const generateTicks = (min: number, max: number, numTicks = 5) => {
  const range = max - min;
  if (range <= 0) return [min];

  const rawStep = range / (numTicks - 1);
  const mag = Math.floor(Math.log10(rawStep));
  const magPow = Math.pow(10, mag);
  const magMsd = Math.round(rawStep / magPow);

  let step;
  if (magMsd > 5) {
    step = 10 * magPow;
  } else if (magMsd > 2) {
    step = 5 * magPow;
  } else if (magMsd > 1) {
    step = 2 * magPow;
  } else {
    step = 1 * magPow;
  }
  
  const start = Math.ceil(min / step) * step;
  const ticks = [];
  for (let i = start; i <= max; i += step) {
    ticks.push(i);
  }
  return ticks;
};

export const formatAge = (seconds: number | undefined) => {
  if (seconds === undefined) return '';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
};

export const mapTokenDataToHolding = (tokenData: EnrichedTokenData): Holding => {
  const getSourceFromStatus = (status?: string): string | undefined => {
    if (!status) return undefined;
    const lowerStatus = status.toLowerCase();
    if (lowerStatus === 'live') return 'pump_fun';
    if (lowerStatus === 'migrated' || lowerStatus === 'complete') return 'pump_amm';
    return undefined;
  };

  return {
    address: tokenData.mint,
    name: tokenData.name || 'Unknown Token',
    symbol: tokenData.symbol || 'UNK',
    balance: 0, // not relevant for atlas
    rawBalance: 0,
    source: getSourceFromStatus(tokenData.status),
    image: tokenData.image || '/vite.svg',
    is_mayhem_mode: tokenData.is_mayhem_mode,
    market_cap: tokenData.market_cap != null || tokenData.market_cap_usd != null
      ? {
          valueSol: tokenData.market_cap ?? 0,
          valueUsd: tokenData.market_cap_usd ?? 0,
        }
      : undefined,
    volume_24h: tokenData.volume != null || tokenData.volume_usd != null
      ? {
          valueSol: tokenData.volume ?? 0,
          valueUsd: tokenData.volume_usd ?? 0,
        }
      : undefined,
    price_info: tokenData.market_cap != null && tokenData.market_cap > 0
      ? {
          price_per_token: 0, // calculate if needed, or leave as 0
          price_usd: 0,
        }
      : undefined,
  };
};

export const normalizeOpacity = (value: number, min: number, max: number) => {
  if (value == null || isNaN(value)) return 0.3;
  if (max === min) return 0.8;
  const normalized = (value - min) / (max - min);
  return Math.max(0.2, Math.min(1.0, 0.3 + normalized * 0.7));
};

