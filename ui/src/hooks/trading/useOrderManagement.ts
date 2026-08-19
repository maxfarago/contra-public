import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import confetti from "canvas-confetti";
import { atlasApi } from "../../lib/api";
import { WalletData, WalletSolResponse, Holding } from "../../types";
import { useOrderCancellation } from "./useOrderCancellation";

export const useOrderManagement = (
  tokenAddress: string | undefined, 
  resetForm?: (type: "buy" | "sell" | "countersell") => void,
  updateTokenBalance?: (amount: number) => void
) => {
  const queryClient = useQueryClient();
  const [isProcessingOrder, setIsProcessingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  // Use the order cancellation hook (for countersell orders in TokenDetail)
  const { handleCancelOrder, cancellingOrderId } = useOrderCancellation(tokenAddress);

  const triggerConfetti = () => {
    const duration = 3000;
    const end = Date.now() + duration;

    const interval = setInterval(() => {
      if (Date.now() > end) {
        clearInterval(interval);
        return;
      }

      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#FFD700', '#FF6B6B', '#4ECDC4', '#95E1D3', '#F38181'],
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#FFD700', '#FF6B6B', '#4ECDC4', '#95E1D3', '#F38181'],
      });
    }, 250);
  };

  const performOptimisticUpdates = (
    type: "buy" | "sell",
    solAmount: number,
    tokenAmount: number,
    mint: string
  ) => {
    if (!tokenAddress && !mint) return;
    const targetMint = tokenAddress || mint;

    // Update local token balance immediately
    if (updateTokenBalance) {
      updateTokenBalance(tokenAmount);
    }

    // Optimistically update SOL Balance
    queryClient.setQueryData<WalletSolResponse>(["solBalance"], (oldData) => {
      if (!oldData?.balance) return oldData;
      // For buy: subtract SOL, for sell: add SOL back
      const balanceChange = type === "buy" ? -solAmount : solAmount;
      return { ...oldData, balance: oldData.balance + balanceChange };
    });

    // Optimistically update Token Holdings
    queryClient.setQueryData<WalletData>(["wallet"], (oldData) => {
      if (!oldData || !targetMint) return oldData;

      const holdings = oldData.holdings;
      const holdingIndex = holdings.findIndex((h) => h.address === targetMint);

      if (holdingIndex > -1) {
        // Update existing holding
        const updatedHolding = { ...holdings[holdingIndex] };
        const balanceChange = type === "buy" ? tokenAmount : -tokenAmount;
        updatedHolding.balance += balanceChange;
        updatedHolding.rawBalance += balanceChange * 10 ** 6;

        // If balance becomes zero or negative, remove the holding
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
      } else if (type === "buy" && tokenAmount > 0) {
        // Create new holding for first-time buy
        const newHolding: Holding = {
          address: targetMint,
          name: "Loading...",
          symbol: "Loading...",
          balance: tokenAmount,
          rawBalance: tokenAmount * 10 ** 6,
        };
        
        return { 
          ...oldData, 
          holdings: [...holdings, newHolding],
          totalTokensHeld: oldData.totalTokensHeld + 1
        };
      }
      
      return oldData;
    });

    // Invalidate atlas holdings to get updated cost basis
    queryClient.invalidateQueries({ queryKey: ["atlasHoldings"] });
  };

  const runCreateTrade = async (params: {
    token_mint: string;
    type: "OneShotBuy" | "OneShotSell";
    amount_sol?: number;
    amount_tokens?: number;
  }) => {
    setIsProcessingOrder(true);
    setOrderError(null);

    try {
      const endpoint = params.type === "OneShotBuy" ? "/trade/buy" : "/trade/sell";
      const payload = {
        mint: params.token_mint,
        amount: params.type === "OneShotBuy" ? params.amount_sol! : params.amount_tokens!,
      };

      const response = await atlasApi.post(endpoint, payload);

      // Handle success
      if (response.status === 204) {
        // 204 No Content - skip optimistic updates
        triggerConfetti();
        if (resetForm) {
          resetForm(params.type === "OneShotBuy" ? "buy" : "sell");
        }
      } else if (response.status === 200 && response.data) {
        // 200 OK with response data - perform optimistic updates
        // TODO: When API returns 200, extract sol_amount and token_amount from response.data
        // const { sol_amount, token_amount } = response.data;
        // performOptimisticUpdates(
        //   params.type === "OneShotBuy" ? "buy" : "sell",
        //   sol_amount,
        //   token_amount,
        //   params.token_mint
        // );
        triggerConfetti();
        if (resetForm) {
          resetForm(params.type === "OneShotBuy" ? "buy" : "sell");
        }
      }
    } catch (error: any) {
      // Handle errors
      let errorMessage = "Trade failed. Please try again.";
      
      if (error.response) {
        const status = error.response.status;
        if (status === 400) {
          errorMessage = "Invalid request. Please check your inputs.";
        } else if (status === 401) {
          errorMessage = "Unauthorized. Please log in again.";
        } else if (status === 500) {
          errorMessage = "Server error. Please try again later.";
        }
      }
      
      alert(errorMessage);
      setOrderError(errorMessage);
      
      if (resetForm) {
        resetForm(params.type === "OneShotBuy" ? "buy" : "sell");
      }
    } finally {
      setIsProcessingOrder(false);
    }
  };

  return {
    runCreateTrade,
    isProcessingOrder,
    handleCancelOrder,
    cancellingOrderId,
    orderError,
  };
};

