import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TokenData, WsMessage, TradeFillPayload } from '../../components/atlas/types';
import { AtlasHolding } from '../atlas/useAtlasHoldings';
import { WalletData, WalletSolResponse, Holding } from '../../types';

interface UseAtlasWebSocketReturn {
  tokensRef: React.MutableRefObject<Map<string, TokenData>>;
  tokenCount: number;
  migrationThresholdUsd: number | null;
  ymaxUsd: number | null;
  isPausedByInactivity: boolean;
  isWalletHot: boolean | null; // null = unknown, true = hot, false = not hot
  pause: () => void;
  resume: () => void;
}

export const useAtlasWebSocket = (): UseAtlasWebSocketReturn => {
  const queryClient = useQueryClient();
  const tokensRef = useRef<Map<string, TokenData>>(new Map());
  const [tokenCount, setTokenCount] = useState<number>(0);
  const [migrationThresholdUsd, setMigrationThresholdUsd] = useState<number | null>(null);
  const [ymaxUsd, setYmaxUsd] = useState<number | null>(null);
  const [isPausedByInactivity, setIsPausedByInactivity] = useState<boolean>(false);
  const [isWalletHot, setIsWalletHot] = useState<boolean | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTabHiddenRef = useRef<boolean>(false);
  const isInactivityPausedRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  // handle trade_fill events - update caches with settled trade amounts
  const handleTradeFill = useCallback((payload: TradeFillPayload) => {
    const { side, mint, tokens, sol, signature, trade_id } = payload;
    const isBuy = side === 'BUY';

    console.log(`[ws] trade_fill: ${side} ${tokens} tokens, ${sol} SOL (mint: ${mint}, trade_id: ${trade_id})`);

    // update SOL balance cache
    queryClient.setQueryData<WalletSolResponse>(["solBalance"], (oldData) => {
      if (!oldData?.balance) return oldData;
      const balanceChange = isBuy ? -sol : sol;
      return { ...oldData, balance: oldData.balance + balanceChange };
    });

    // update wallet holdings cache
    queryClient.setQueryData<WalletData>(["wallet"], (oldData) => {
      if (!oldData || !mint) return oldData;

      const holdings = oldData.holdings;
      const holdingIndex = holdings.findIndex((h) => h.address === mint);

      if (holdingIndex > -1) {
        // update existing holding
        const updatedHolding = { ...holdings[holdingIndex] };
        const balanceChange = isBuy ? tokens : -tokens;
        updatedHolding.balance += balanceChange;
        updatedHolding.rawBalance += balanceChange * 10 ** 6;

        // if balance becomes zero or negative, remove the holding
        if (updatedHolding.balance <= 0) {
          const newHoldings = holdings.filter((_, index) => index !== holdingIndex);
          return {
            ...oldData,
            holdings: newHoldings,
            totalTokensHeld: Math.max(0, oldData.totalTokensHeld - 1)
          };
        } else {
          const newHoldings = [...holdings];
          newHoldings[holdingIndex] = updatedHolding;
          return { ...oldData, holdings: newHoldings };
        }
      } else if (isBuy && tokens > 0) {
        // create new holding for first-time buy
        const newHolding: Holding = {
          address: mint,
          name: "Loading...",
          symbol: "Loading...",
          balance: tokens,
          rawBalance: tokens * 10 ** 6,
        };

        return {
          ...oldData,
          holdings: [...holdings, newHolding],
          totalTokensHeld: oldData.totalTokensHeld + 1
        };
      }

      return oldData;
    });

    // update atlas holdings cache optimistically
    queryClient.setQueryData<AtlasHolding[]>(["atlasHoldings"], (oldData) => {
      if (!oldData) return oldData;

      const holdingIndex = oldData.findIndex((h) => h.mint === mint);

      if (holdingIndex > -1) {
        // update existing holding
        const existingHolding = oldData[holdingIndex];
        const newHoldings = [...oldData];

        if (isBuy) {
          // buy: add tokens and cost basis
          const newQuantity = existingHolding.quantity + tokens;
          const newCostBasisSol = existingHolding.cost_basis_sol + sol;
          // estimate USD cost basis (approximate, will be corrected on refetch)
          const costBasisRatio = existingHolding.quantity > 0 
            ? existingHolding.cost_basis_usd / existingHolding.cost_basis_sol 
            : 1;
          const newCostBasisUsd = newCostBasisSol * costBasisRatio;

          newHoldings[holdingIndex] = {
            ...existingHolding,
            quantity: newQuantity,
            cost_basis_sol: newCostBasisSol,
            cost_basis_usd: newCostBasisUsd,
          };
        } else {
          // sell: reduce quantity and cost basis proportionally
          if (existingHolding.quantity > 0) {
            const sellRatio = tokens / existingHolding.quantity;
            const newQuantity = existingHolding.quantity - tokens;
            
            if (newQuantity <= 0) {
              // remove holding if quantity reaches zero
              return oldData.filter((_, index) => index !== holdingIndex);
            }

            const newCostBasisSol = existingHolding.cost_basis_sol * (1 - sellRatio);
            const newCostBasisUsd = existingHolding.cost_basis_usd * (1 - sellRatio);

            newHoldings[holdingIndex] = {
              ...existingHolding,
              quantity: newQuantity,
              cost_basis_sol: newCostBasisSol,
              cost_basis_usd: newCostBasisUsd,
            };
          }
        }

        return newHoldings;
      } else if (isBuy && tokens > 0) {
        // create new holding for first-time buy
        // estimate USD cost basis (approximate, will be corrected on refetch)
        const estimatedCostBasisUsd = sol * 150; // rough estimate, will be corrected on refetch

        const newHolding: AtlasHolding = {
          mint,
          quantity: tokens,
          cost_basis_sol: sol,
          cost_basis_usd: estimatedCostBasisUsd,
        };

        return [...oldData, newHolding];
      }

      return oldData;
    });

    // invalidate positions cache for this token to trigger refetch
    queryClient.invalidateQueries({ queryKey: ["positions", mint] });

    // refetch atlas holdings to get accurate cost basis (especially USD)
    queryClient.invalidateQueries({ queryKey: ["atlasHoldings"] });
  }, [queryClient]);

  const connect = useCallback(() => {
    if (!isMountedRef.current || isTabHiddenRef.current || isInactivityPausedRef.current) return;

    // reset wallet status to unknown when connecting
    setIsWalletHot(null);

    // single unified /ws endpoint for all message types
    const wsUrl = import.meta.env.VITE_ATLAS_WS_URL || 'ws://localhost:4242/ws';
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      if (!isMountedRef.current) {
        wsRef.current?.close();
      }
      // server will send snapshot first, then wallet_hot (if hot) on connect
    };

    wsRef.current.onclose = () => {
      // reset wallet status to unknown when disconnected
      setIsWalletHot(null);
      
      if (isMountedRef.current && !isTabHiddenRef.current && !isInactivityPausedRef.current) {
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      }
    };

    wsRef.current.onerror = (error) => {
      console.error('[ws] error:', error);
    };

    wsRef.current.onmessage = (event: MessageEvent) => {
      if (!isMountedRef.current) return;

      if (event.data === 'ping') {
        wsRef.current?.send('pong');
        return;
      }

      try {
        const data: WsMessage = JSON.parse(event.data);

        switch (data.payload_type) {
          case 'snapshot': {
            // snapshot only contains new tokens, no updated/deleted arrays
            const newTokens = new Map<string, TokenData>();
            data.new.forEach(token => newTokens.set(token.mint, token));
            tokensRef.current = newTokens;
            setTokenCount(data.count);
            setMigrationThresholdUsd(data.migration_usd ?? null);
            setYmaxUsd(data.ymax_usd ?? null);
            break;
          }

          case 'delta': {
            // handle new tokens
            data.new?.forEach(token => tokensRef.current.set(token.mint, token));
            
            // handle updated tokens (partial updates)
            data.updated?.forEach(update => {
              const existingToken = tokensRef.current.get(update.mint);
              if (existingToken) {
                // merge partial fields into existing token
                Object.assign(existingToken, update);
              } else {
                // snapshot should arrive first, but log warning if update arrives for unknown token
                console.warn('[ws] Received update for unknown token:', update.mint);
              }
            });
            
            // handle deleted tokens
            data.deleted?.forEach(mint => {
              tokensRef.current.delete(mint);
            });
            
            setTokenCount(data.count);
            setMigrationThresholdUsd(data.migration_usd ?? null);
            setYmaxUsd(data.ymax_usd ?? null);
            break;
          }

          case 'wallet_hot': {
            console.log('[ws] wallet status:', data.wallet_hot ? 'HOT' : 'COLD');
            setIsWalletHot(data.wallet_hot);
            break;
          }

          case 'trade_fill': {
            handleTradeFill(data);
            break;
          }

          default: {
            console.warn('[ws] unknown payload_type:', data);
            break;
          }
        }
      } catch (error) {
        console.error('[ws] failed to parse message:', error, 'raw data:', event.data);
      }
    };
  }, [handleTradeFill]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
      }
      wsRef.current = null;
      // reset wallet status when disconnecting
      setIsWalletHot(null);
    }
  }, []);

  const pause = useCallback(() => {
    isInactivityPausedRef.current = true;
    setIsPausedByInactivity(true);
    disconnect();
  }, [disconnect]);

  const resume = useCallback(() => {
    isInactivityPausedRef.current = false;
    setIsPausedByInactivity(false);
    connect();
  }, [connect]);

  useEffect(() => {
    isMountedRef.current = true;

    const handleVisibilityChange = () => {
      if (!isMountedRef.current) return;

      if (document.visibilityState === 'hidden') {
        isTabHiddenRef.current = true;
        disconnect();
      } else if (document.visibilityState === 'visible') {
        isTabHiddenRef.current = false;
        if (!isInactivityPausedRef.current) {
          connect();
        }
      }
    };

    connect();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMountedRef.current = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    tokensRef,
    tokenCount,
    migrationThresholdUsd,
    ymaxUsd,
    isPausedByInactivity,
    isWalletHot,
    pause,
    resume,
  };
};

