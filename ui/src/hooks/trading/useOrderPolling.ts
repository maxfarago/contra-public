import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

// The leaner response from the /status endpoint
export interface OrderStatus {
  id: string;
  type: "Countersell" | "OneShotBuy" | "OneShotSell";
  status: "PENDING" | "ACTIVE" | "COMPLETED" | "FAILED";
  sol_amount: number;
  token_amount: number;
  updated_at: string;
}

const fetchOrderStatus = async (orderId: string): Promise<OrderStatus> => {
  const { data } = await api.get(`/orders/${orderId}/status`);
  return data;
};

export const useOrderPolling = (
  orderId: string | null,
  orderType: "OneShotBuy" | "OneShotSell" | "Countersell" | null
) => {
  const { data: orderStatus } = useQuery<OrderStatus, Error>({
    queryKey: ["orderStatus", orderId],
    queryFn: () => fetchOrderStatus(orderId!),
    enabled: !!orderId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      
      // Stop polling based on order type and status
      if (status === "FAILED") {
        return false; // Always stop on failure
      }
      
      if (orderType === "Countersell" && status === "COMPLETED") {
        return false; // Countersell orders stop when COMPLETED
      }
      
      if ((orderType === "OneShotBuy" || orderType === "OneShotSell") && status === "COMPLETED") {
        return false; // OneShot orders stop when COMPLETED
      }
      
      return 500; // Continue polling every 500ms
    },
    refetchIntervalInBackground: false,
    retry: false,
  });

  return {
    orderStatus,
  };
};

