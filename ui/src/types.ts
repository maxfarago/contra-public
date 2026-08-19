export interface Order {
  id: string;
  token: {
    mint: string;
    name: string;
    symbol: string;
    imageUrl: string;
  };
  status: "CREATED" | "SUBMITTED" | "ACTIVE" | "COMPLETED" | "FAILED" | "CANCELLED";
  createdAt: string;
  type: "Countersell" | "OneShotBuy" | "OneShotSell";
  
  // For OneShotBuy and OneShotSell
  tokens?: {
    amount: number;
    valueUsd: number;
    valueSol: number;
  };
  sol?: {
    amount: number;
    valueUsd: number;
  };

  // For Countersell orders
  tokensSold?: {
    amount: number;
    valueUsd: number;
    valueSol: number;
  };
  maxTokensToSell?: number;
  targetMcap?: {
    valueSol: number;
    valueUsd: number;
  };
  triggeringBuy?: {
    valueSol: number;
    valueUsd: number;
  };
  sellPercentage?: number;
}

export interface TradeSummary {
  id: string;
  token_mint: string;
  type: "OneShotBuy" | "OneShotSell" | "Countersell";
  status: string;
  created_at: string;
}

export interface Trade extends TradeSummary {
  orders?: Order[];
  logs?: { level: string; message: string; timestamp: string }[];
  amount_sol?: number;
  amount_tokens?: number;
  slippage_pct?: number;
}

export interface TokenInfo {
  image: string;
  name: string;
  symbol: string;
}

export interface Holding {
  address: string;
  name: string;
  symbol: string;
  balance: number; // display balance in tokens
  rawBalance: number; // raw balance in microtokens
  source?: string;
  image?: string;
  is_mayhem_mode?: boolean;
  market_cap?: {
    valueUsd: number;
    valueSol: number;
  };
  volume_24h?: {
    valueUsd: number;
    valueSol: number;
  };
  liquidity?: {
    valueUsd: number;
    valueSol: number;
  };
  decimals?: number;
  price_info?: {
    price_per_token: number;
    currency?: string;
    price_usd?: number;
  };
}

export interface WalletData {
  holdings: Holding[];
  publicKey: string;
  totalTokenAccounts: number;
  totalTokensHeld: number;
}

export interface WalletSolResponse {
  publicKey: string;
  balance?: number;
}

// New types for positions API response
export interface PositionData {
  token: {
    name: string;
    symbol: string;
    mint: string;
    imageUrl: string;
  };
  position: {
    balance: {
      tokens: number;
      valueUsd: number;
      valueSol: number;
    };
    unrealizedPnl: {
      valueUsd: number;
      valueSol: number;
      percentage: number;
    };
    realizedPnl: {
      valueUsd: number;
      valueSol: number;
      percentage: number;
    };
    bought: {
      totalValueUsd: number;
      totalValueSol: number;
      avgPriceUsd: number;
      avgPriceSol: number;
    };
    sold: {
      totalValueUsd: number;
      totalValueSol: number;
      avgPriceUsd: number;
      avgPriceSol: number;
    };
    totalProfit: {
      valueUsd: number;
      valueSol: number;
      percentage: number;
    };
  };
  orders: Order[];
  logs: {
    level: string;
    message: string;
    timestamp: string;
    order_id?: number;
  }[];
}

// Portfolio positions API response (simplified version without orders/logs)
export interface PortfolioPosition {
  token: {
    name: string;
    symbol: string;
    mint: string;
    imageUrl: string;
  };
  balance: {
    tokens: number;
    valueUsd: number;
    valueSol?: number;
  };
  unrealizedPnl: {
    valueUsd: number;
    valueSol?: number;
    percentage: number;
  };
  realizedPnl: {
    valueUsd: number;
    valueSol?: number;
    percentage: number;
  };
  bought: {
    totalValueUsd: number;
    totalValueSol?: number;
    avgPriceUsd: number;
  };
  sold: {
    totalValueUsd: number;
    totalValueSol?: number;
    avgPriceUsd: number;
  };
  totalProfit: {
    valueUsd: number;
    valueSol?: number;
    percentage: number;
  };
  transactionCounts: {
    buyCount: number;
    sellCount: number;
  };
}
