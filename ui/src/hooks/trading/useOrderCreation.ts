import { useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Trade } from "../../types";

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

