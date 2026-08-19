import { useState, useCallback } from "react";

export interface OrderState {
  id: number;
  max_percentage_to_sell: string;
  target_mcap_usd: string;
  buy_threshold_sol: string;
  sell_percentage: string;
}

export const useFormState = () => {
  // State for Forms
  const [amountToBuy, setAmountToBuy] = useState("0.01");
  const [amountToSell, setAmountToSell] = useState("");
  const [slippage, setSlippage] = useState("30");
  const [buyError, setBuyError] = useState<string | null>(null);
  const [sellError, setSellError] = useState<string | null>(null);

  // State for CountersellForm
  const [formOrders, setFormOrders] = useState<OrderState[]>([
    {
      id: Date.now(),
      max_percentage_to_sell: "",
      target_mcap_usd: "",
      buy_threshold_sol: "",
      sell_percentage: "",
    },
  ]);

  const handleOrderChange = useCallback(
    (id: number, e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setFormOrders((prevOrders) =>
        prevOrders.map((order) =>
          order.id === id ? { ...order, [name]: value } : order
        )
      );
    },
    []
  );

  const handlePresetClick = useCallback(
    (orderId: number, name: string, value: number) => {
      setFormOrders((prevOrders) =>
        prevOrders.map((order) =>
          order.id === orderId ? { ...order, [name]: value.toString() } : order
        )
      );
    },
    []
  );

  const addOrder = useCallback(() => {
    setFormOrders((prevOrders) => {
      if (prevOrders.length < 4) {
        return [
          ...prevOrders,
          {
            id: Date.now(),
            max_percentage_to_sell: "",
            target_mcap_usd: "",
            buy_threshold_sol: "",
            sell_percentage: "",
          },
        ];
      }
      return prevOrders;
    });
  }, []);

  const removeOrder = useCallback((id: number) => {
    setFormOrders((prevOrders) =>
      prevOrders.filter((order) => order.id !== id)
    );
  }, []);

  const resetForm = useCallback((type: "buy" | "sell" | "countersell") => {
    if (type === "buy") {
      setAmountToBuy("0.01");
      setBuyError(null);
    } else if (type === "sell") {
      setAmountToSell("");
      setSellError(null);
    } else if (type === "countersell") {
      setFormOrders([
        {
          id: Date.now(),
          max_percentage_to_sell: "",
          target_mcap_usd: "",
          buy_threshold_sol: "",
          sell_percentage: "",
        },
      ]);
    }
  }, []);

  const setError = useCallback((type: "buy" | "sell", error: string) => {
    if (type === "buy") {
      setBuyError(error);
    } else {
      setSellError(error);
    }
  }, []);

  return {
    // Form state
    amountToBuy,
    setAmountToBuy,
    amountToSell,
    setAmountToSell,
    slippage,
    setSlippage,
    buyError,
    sellError,
    
    // Countersell state
    formOrders,
    setFormOrders,
    
    // Handlers
    handleOrderChange,
    handlePresetClick,
    addOrder,
    removeOrder,
    resetForm,
    setError,
  };
};
