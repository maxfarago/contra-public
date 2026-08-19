import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../lib/api";
import { Order } from "../../types";

const cancelOrder = async (orderId: string): Promise<void> => {
  await api.delete(`/orders/${orderId}`);
};

export const useOrderCancellation = (tokenAddress: string | undefined) => {
  const queryClient = useQueryClient();
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);

  const { mutate: cancelOrderMutation } = useMutation<void, Error, string>({
    mutationFn: cancelOrder,
    onSuccess: () => {
      // Update local state to mark order as CANCELLED
      queryClient.setQueryData(["positions", tokenAddress], (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          orders: oldData.orders.map((order: Order) =>
            order.id === cancellingOrderId
              ? { ...order, status: "CANCELLED" as const }
              : order
          )
        };
      });
    },
    onError: (error) => {
      console.error("Failed to cancel order:", error);
      // Update local state to mark order as FAILED
      queryClient.setQueryData(["positions", tokenAddress], (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          orders: oldData.orders.map((order: Order) =>
            order.id === cancellingOrderId
              ? { ...order, status: "FAILED" as const }
              : order
          )
        };
      });
    },
    onSettled: () => {
      setCancellingOrderId(null);
    },
  });

  const handleCancelOrder = (orderId: string) => {
    setCancellingOrderId(orderId);
    cancelOrderMutation(orderId);
  };

  return {
    handleCancelOrder,
    cancellingOrderId,
  };
};

