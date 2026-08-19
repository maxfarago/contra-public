export interface TokenData {
  mint: string;
  created_timestamp: number;
  age?: number; // calculated client-side
  // enrichment fields
  market_cap?: number;
  volume?: number;
  market_cap_usd?: number;
  volume_usd?: number;
  volume_5min?: number | null;
  tx_count?: number;
  status?: string;
  is_mayhem_mode?: boolean;
  token_program?: string;
  // metadata fields
  name?: string;
  symbol?: string;
  uri?: string;
  image?: string;
}

export interface SnapshotPayload {
  payload_type: "snapshot";
  new: TokenData[];
  count: number;
  migration_usd?: number;
  ymax_usd?: number;
}

export interface DeltaPayload {
  payload_type: "delta";
  new?: TokenData[];
  updated?: TokenData[];
  deleted?: string[];
  count: number;
  migration_usd?: number;
  ymax_usd?: number;
}

export interface WalletHotPayload {
  payload_type: "wallet_hot";
  wallet_hot: boolean;
}

export interface TradeFillPayload {
  payload_type: "trade_fill";
  trade_id: string;
  signature: string;
  side: "BUY" | "SELL";
  mint: string;
  tokens: number;
  sol: number;
}

// unified message type for all WebSocket messages
export type WsMessage = SnapshotPayload | DeltaPayload | WalletHotPayload | TradeFillPayload;

// legacy type aliases for backward compatibility
export type WebSocketPayload = WsMessage;
export type WalletWebSocketPayload = WalletHotPayload | TradeFillPayload;

export interface AtlasHoldingInfo {
  quantity: number;
  cost_basis_sol: number;
  cost_basis_usd: number;
  current_value_sol: number;
  current_value_usd: number;
  pnl_sol: number;
  pnl_usd: number;
  pnl_percent: number;
}

export type EnrichedTokenData = TokenData & {
  holding?: AtlasHoldingInfo;
};

export type OpacityMetric = 'volume' | 'tx_count';

