import { useMemo } from "react";
import { Holding, WalletData, WalletSolResponse, PositionData, Order } from "../../types";
import { useCurrency } from "../../contexts/CurrencyContext";
import { formatLargeNumber, formatPriceWithSubscript } from "../formatters";

export const useTokenDetailCalculations = (
  tokenInfo?: Holding,
  walletData?: WalletData,
  solBalanceData?: WalletSolResponse,
  positionData?: PositionData,
  amountToBuy?: string,
  amountToSell?: string,
  tokenAddress?: string
) => {
  const { currency } = useCurrency();
  const holdingInWallet = useMemo(() => {
    if (!walletData || !tokenAddress) return undefined;
    return walletData.holdings.find((h) => h.address === tokenAddress);
  }, [walletData, tokenAddress]);

  const isBalanceInsufficient = useMemo(() => {
    if (!solBalanceData?.balance || !amountToBuy) return false;
    return parseFloat(amountToBuy) > solBalanceData.balance;
  }, [amountToBuy, solBalanceData]);

  const isSellBalanceInsufficient = useMemo(() => {
    if (!holdingInWallet || !amountToSell) return false;
    return parseFloat(amountToSell) > holdingInWallet.balance;
  }, [amountToSell, holdingInWallet]);

  const estimatedTokens = useMemo(() => {
    if (tokenInfo?.price_info?.price_per_token && amountToBuy) {
      const amount = parseFloat(amountToBuy);
      const price = tokenInfo.price_info.price_per_token;
      if (!isNaN(amount) && price > 0) return amount / price;
    }
    return null;
  }, [tokenInfo, amountToBuy]);

  const { activeOrders, pastOrders, logs, hasWelcomeLogs } = useMemo(() => {
    const active: Order[] = [];
    const past: Order[] = [];
    let orderLogs: PositionData['logs'] = [];
    let hasWelcomeLogs = false;

    // If we have position data, process it
    if (positionData) {
      orderLogs = positionData.logs || [];
      
      const pastStatuses = ['FILLED', 'CANCELLED', 'FAILED', 'CREATED', 'COMPLETED', 'DELETED'];

      positionData.orders.forEach((order) => {
        if (pastStatuses.includes(order.status)) {
          // This order belongs in the past/closed tab.
          // Now, check if its status needs to be relabeled.
          if (order.status === 'CREATED') {
            past.push({ ...order, status: 'FAILED' });
          } else {
            past.push(order);
          }
        } else {
          // Any other status ('ACTIVE', 'PENDING', etc.) is an active order.
          active.push(order);
        }
      });
    }

    // Add welcome logs at the top if we have token info
    if (tokenInfo?.symbol) {
      const welcomeLogs = [
        {
          level: "INFO",
          message: "enjoy the trenches ;)",
          timestamp: new Date().toISOString()
        },
        {
          level: "INFO",
          message: "minimum slippage, stay invisible, no more round tripping",
          timestamp: new Date().toISOString()
        },
        {
          level: "INFO",
          message: "contra starts monitoring your token and lands your countersell Txs",
          timestamp: new Date().toISOString()
        },
        {
          level: "INFO",
          message: "set your countersell rules",
          timestamp: new Date().toISOString()
        },
        {
          level: "INFO",
          message: `buy or deposit $${tokenInfo.symbol}`,
          timestamp: new Date().toISOString()
        },
        {
          level: "INFO",
          message: "welcome to contra — the first countersell execution program.",
          timestamp: new Date().toISOString()
        }
      ];
      // Only add welcome logs if there are no existing order logs
      if (orderLogs.length === 0) {
        hasWelcomeLogs = true;
        orderLogs = [...welcomeLogs, ...orderLogs];
      } else {
        // orderLogs = [...welcomeLogs, ...orderLogs];
      }
    }

    return { activeOrders: active, pastOrders: past.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), logs: orderLogs, hasWelcomeLogs };
  }, [positionData?.orders, tokenInfo]);

  const summaryStatsData = useMemo(() => {
    if (!positionData || !positionData.position || !positionData.token) {
      return {
        headers: ["Balance", "Unrealized", "Realized", "Bought/Avg", "Sold/Avg", "Total Profit"],
        values: ["-", "-", "-", "-", "-", "-"]
      };
    }

    const { position, token } = positionData;
    
    // Helper function to format currency values
    const formatCurrencyValue = (valueUsd: number, valueSol: number) => {
      const value = currency === "USD" ? valueUsd : valueSol;
      const prefix = currency === "USD" ? "$" : "";
      const suffix = currency === "SOL" ? " SOL" : "";
      return `${prefix}${formatLargeNumber(value)}${suffix}`;
    };

    // Helper function to format price values
    const formatPriceValue = (priceUsd: number, priceSol: number) => {
      const price = currency === "USD" ? priceUsd : priceSol;
      const prefix = currency === "USD" ? "$" : "";
      const suffix = currency === "SOL" ? " SOL" : "";
      return `${prefix}${formatPriceWithSubscript(price)}${suffix}`;
    };
    
    return {
      headers: ["Balance", "Unrealized", "Realized", "Bought/Avg", "Sold/Avg", "Total Profit"],
      values: [
        {
          primary: formatCurrencyValue(position.balance.valueUsd, position.balance.valueSol),
          secondary: `${position.balance.tokens.toLocaleString()} ${token.symbol}`
        },
        {
          primary: formatCurrencyValue(position.unrealizedPnl.valueUsd, position.unrealizedPnl.valueSol),
          secondary: `${(position.unrealizedPnl.percentage * 100).toFixed(2)}%`,
          colorize: true
        },
        {
          primary: formatCurrencyValue(position.realizedPnl.valueUsd, position.realizedPnl.valueSol),
          secondary: `${(position.realizedPnl.percentage * 100).toFixed(2)}%`,
          colorize: true
        },
        {
          primary: formatCurrencyValue(position.bought.totalValueUsd, position.bought.totalValueSol),
          secondary: formatPriceValue(position.bought.avgPriceUsd, position.bought.avgPriceSol)
        },
        {
          primary: formatCurrencyValue(position.sold.totalValueUsd, position.sold.totalValueSol),
          secondary: formatPriceValue(position.sold.avgPriceUsd, position.sold.avgPriceSol)
        },
        {
          primary: formatCurrencyValue(position.totalProfit.valueUsd, position.totalProfit.valueSol),
          secondary: `${(position.totalProfit.percentage * 100).toFixed(2)}%`,
          colorize: true
        }
      ]
    };
  }, [positionData, currency]);

  return {
    holdingInWallet,
    isBalanceInsufficient,
    isSellBalanceInsufficient,
    estimatedTokens,
    activeOrders,
    pastOrders,
    logs,
    hasWelcomeLogs,
    summaryStatsData,
  };
};
