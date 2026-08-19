import { useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Trade } from "../../types";
import { analytics } from "../../lib/analytics";

const createOrder = async (newOrder: any): Promise<Trade> => {
  const { data } = await api.post("/orders", newOrder);
  return data;
};

export const useOrderCreation = (
  onSuccess?: (data: Trade) => void,
  onError?: (error: Error) => void
) => {
  const {
    mutate: createOrderMutation,
    isPending: isCreating,
  } = useMutation<Trade, Error, any>({
    mutationFn: createOrder,
    onSuccess: (data) => {
      // Track analytics event
      if (data.type === "OneShotBuy") {
        analytics.trackBuyOrder(
          data.token_mint || "Unknown",
          data.amount_tokens || 0,
          data.amount_sol || 0
        );
      } else if (data.type === "OneShotSell") {
        analytics.trackSellOrder(
          data.token_mint || "Unknown", 
          data.amount_tokens || 0,
          data.amount_sol || 0
        );
      } else if (data.type === "Countersell") {
        analytics.trackCountersellOrder(
          data.token_mint || "Unknown",
          data.amount_tokens || 0,
          data.amount_sol || 0
        );
      }
      
      onSuccess?.(data);
    },
    onError: (error) => {
      onError?.(error);
    },
  });

  return {
    createOrder: createOrderMutation,
    isCreating,
  };
};

