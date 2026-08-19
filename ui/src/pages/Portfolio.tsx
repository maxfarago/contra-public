import React, { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import PageLayout from "../components/layout/PageLayout";
import TabNavigation from "../components/ui/TabNavigation";
import TokenInfo from "../components/token/TokenInfo";
import GhostLoader from "../components/ui/GhostLoader";
import AllOrdersList from "../components/trading/AllOrdersList";
import { formatLargeNumber, formatPriceWithSubscript, formatPercentage } from "../lib/formatters";
import { PortfolioPosition, Order } from "../types";
import { useOrderManagement } from "../hooks/trading/useOrderManagement";
import { useCurrency } from "../contexts/CurrencyContext";
import { api } from "../lib/api";
import "../styles/pages/portfolio.css";
import "../styles/components/all-orders-list.css";

// Using PortfolioPosition from types.ts

// API calls
const fetchPositions = async (): Promise<PortfolioPosition[]> => {
  const { data } = await api.get('/positions');
  return data;
};

const fetchAllOrders = async (): Promise<Order[]> => {
  const { data } = await api.get('/orders');
  return data;
};

const Portfolio: React.FC = () => {
  const [activeTab, setActiveTab] = useState("open");
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [sellingPositions, setSellingPositions] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  // Fetch all positions
  const { data: allPositions, isLoading: isPositionsLoading, error: positionsError } = useQuery<PortfolioPosition[]>({
    queryKey: ["positions"],
    queryFn: fetchPositions,
    retry: 2,
    retryDelay: 1000,
  });

  // Fetch all orders
  const { data: allOrders, isLoading: isAllOrdersLoading, error: ordersError } = useQuery<Order[]>({
    queryKey: ["allOrders"],
    queryFn: fetchAllOrders,
    enabled: activeTab === "all",
    retry: 2,
    retryDelay: 1000,
  });

  // Currency context
  const { currency } = useCurrency();

  // Order management hook for sell all functionality
  const { runCreateTrade, isProcessingOrder } = useOrderManagement(undefined, () => {
    // Reset form callback - not needed for portfolio but required by hook
  });

  // Split positions into open and closed based on balance
  const { openPositions, closedPositions } = useMemo(() => {
    if (!allPositions) return { openPositions: [], closedPositions: [] };
    
    const open = allPositions.filter(position => position.balance.tokens > 0);
    const closed = allPositions.filter(position => position.balance.tokens === 0);
    
    return { openPositions: open, closedPositions: closed };
  }, [allPositions]);

  // Clear selling positions when positions data changes (order completed)
  useEffect(() => {
    if (allPositions) {
      setSellingPositions(new Set());
    }
  }, [allPositions]);

  // Currency-aware formatting functions
  const formatValue = (valueUsd: number | undefined, valueSol?: number | undefined) => {
    if (valueUsd === undefined || valueUsd === null || isNaN(valueUsd)) return '$0.00';
    
    if (currency === "SOL") {
      // Use valueSol if available, otherwise fall back to valueUsd
      const value = valueSol !== undefined && valueSol !== null && !isNaN(valueSol) ? valueSol : valueUsd;
      return `${formatPriceWithSubscript(value)} SOL`;
    } else {
      return `$${valueUsd.toFixed(2)}`;
    }
  };

  const formatBalanceValue = (balance: { valueUsd: number; valueSol?: number }) => {
    return formatValue(balance.valueUsd, balance.valueSol);
  };

  const formatPnlValue = (pnl: { valueUsd: number; valueSol?: number }) => {
    return formatValue(pnl.valueUsd, pnl.valueSol);
  };

  const formatBoughtSoldValue = (boughtSold: { totalValueUsd: number; totalValueSol?: number }) => {
    return formatValue(boughtSold.totalValueUsd, boughtSold.totalValueSol);
  };
  
  const handlePositionClick = (tokenMint: string) => {
    navigate(`/portfolio/${tokenMint}`);
  };

  const handleCopyClick = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAddress(text);
    // Reset copied state after 2 seconds
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const handleSellAll = async (position: PortfolioPosition) => {
    const tokenMint = position.token.mint;
    const tokenBalance = position.balance.tokens;
    
    if (!tokenMint || tokenBalance <= 0) return;

    // Add to selling positions set
    setSellingPositions(prev => new Set(prev).add(tokenMint));

    try {
      await runCreateTrade({
        token_mint: tokenMint,
        type: "OneShotSell",
        amount_tokens: tokenBalance,
      });
      // Don't clear the selling state here - let the useOrderManagement hook handle it
      // The positions will be refetched when the order completes
    } catch (error) {
      console.error("Failed to sell all tokens:", error);
      // Only clear on error
      setSellingPositions(prev => {
        const newSet = new Set(prev);
        newSet.delete(tokenMint);
        return newSet;
      });
    }
  };

  const renderPositions = (positions: PortfolioPosition[] | undefined, isLoading: boolean, error?: Error, isOpenPositions: boolean = false) => {
    if (isLoading) {
      return <GhostLoader rows={5} />;
    }

    if (error) {
      return (
        <div className="portfolio-error">
          <p>Failed to load positions. Please try again.</p>
          <button 
            onClick={() => window.location.reload()} 
            className="portfolio-retry-button"
          >
            Retry
          </button>
        </div>
      );
    }

    if (!positions || positions.length === 0) {
      return <p className="portfolio-empty">No positions found.</p>;
    }

    return (
      <div className="portfolio-table-container">
        <table className="portfolio-table">
          <thead>
            <tr>
              <th>Token</th>
              <th>Total Profit</th>
              <th>Balance</th>
              <th>Unrealized</th>
              <th>Realized</th>
              <th>Bought / Avg</th>
              <th>Sold / Avg</th>
              <th>Txs</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {positions.map((position, index) => {
              // Safe access to nested properties with fallbacks
              const token = position?.token || { name: 'Unknown', symbol: 'UNK', mint: '', imageUrl: '' };
              const balance = position?.balance || { tokens: 0, valueUsd: 0, valueSol: 0 };
              const totalProfit = position?.totalProfit || { valueUsd: 0, percentage: 0 };
              const unrealizedPnl = position?.unrealizedPnl || { valueUsd: 0 };
              const realizedPnl = position?.realizedPnl || { valueUsd: 0, percentage: 0 };
              const bought = position?.bought || { totalValueUsd: 0, avgPriceUsd: 0 };
              const sold = position?.sold || { totalValueUsd: 0, avgPriceUsd: 0 };
              const transactionCounts = position?.transactionCounts || { buyCount: 0, sellCount: 0 };

              return (
                <tr 
                  key={`${token.mint || index}-${index}`}
                  onClick={() => handlePositionClick(token.mint || '')}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="portfolio-token">
                    <TokenInfo
                      tokenInfo={{
                        name: token.name || 'Unknown',
                        symbol: token.symbol || 'UNK',
                        address: token.mint || '',
                        image: token.imageUrl || '',
                        price_info: { price_per_token: 0 },
                        market_cap: { valueUsd: 0, valueSol: 0 },
                        balance: 0,
                        rawBalance: 0
                      }}
                      variant="portfolio"
                      showCopyButton={true}
                      priceColor="white"
                      copied={copiedAddress === token.mint}
                      onCopy={handleCopyClick}
                    />
                  </td>
                  <td className={`portfolio-profit ${(totalProfit.valueUsd || 0) > 0 ? 'profit-positive' : (totalProfit.valueUsd || 0) < 0 ? 'profit-negative' : ''}`}>
                    <div className="portfolio-value-stack">
                      <div>{formatPnlValue(totalProfit)}</div>
                      <div>{formatPercentage(totalProfit.percentage)}</div>
                    </div>
                  </td>
                  <td>
                    <div className="portfolio-value-stack">
                      <div>{formatBalanceValue(balance)}</div>
                      <div>{formatLargeNumber(balance.tokens || 0)}</div>
                    </div>
                  </td>
                  <td>
                    <div className="portfolio-value-stack">
                      <div>{formatPnlValue(unrealizedPnl)}</div>
                      <div>{formatPercentage(unrealizedPnl.percentage)}</div>
                    </div>
                  </td>
                  <td className={`portfolio-realized ${(realizedPnl.valueUsd || 0) > 0 ? 'profit-positive' : (realizedPnl.valueUsd || 0) < 0 ? 'profit-negative' : ''}`}>
                    <div className="portfolio-value-stack">
                      <div>{formatPnlValue(realizedPnl)}</div>
                      <div>{formatPercentage(realizedPnl.percentage)}</div>
                    </div>
                  </td>
                  <td>
                    <div className="portfolio-value-stack">
                      <div>{formatBoughtSoldValue(bought)}</div>
                      <div>{currency === "SOL" ? `${formatPriceWithSubscript(bought.avgPriceUsd)} SOL` : `$${formatPriceWithSubscript(bought.avgPriceUsd)}`}</div>
                    </div>
                  </td>
                  <td>
                    <div className="portfolio-value-stack">
                      <div>{formatBoughtSoldValue(sold)}</div>
                      <div>{currency === "SOL" ? `${formatPriceWithSubscript(sold.avgPriceUsd)} SOL` : `$${formatPriceWithSubscript(sold.avgPriceUsd)}`}</div>
                    </div>
                  </td>
                  <td>
                    <div className="portfolio-value-stack">
                      <div>
                        <span className="portfolio-tx-buy">{transactionCounts.buyCount}</span>
                        <span className="portfolio-tx-separator"> / </span>
                        <span className="portfolio-tx-sell">{transactionCounts.sellCount}</span>
                      </div>
                    </div>
                  </td>
                  <td 
                    className="portfolio-action-cell"
                    onClick={(e) => e.stopPropagation()}
                    style={{ cursor: 'default' }}
                  >
                    {isOpenPositions && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSellAll(position);
                        }}
                        disabled={sellingPositions.has(token.mint) || isProcessingOrder}
                        className="portfolio-sell-all-button"
                      >
                        {sellingPositions.has(token.mint) ? "Closing..." : "Sell All"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const getCurrentData = () => {
    switch (activeTab) {
      case "open":
        return { data: openPositions, loading: isPositionsLoading, error: positionsError || undefined, isOpenPositions: true };
      case "closed":
        return { data: closedPositions, loading: isPositionsLoading, error: positionsError || undefined, isOpenPositions: false };
      case "all":
        return { data: allOrders, loading: isAllOrdersLoading, error: ordersError || undefined, isOpenPositions: false };
      default:
        return { data: [], loading: false, error: undefined, isOpenPositions: false };
    }
  };

  const { data: currentData, loading: currentLoading, error: currentError, isOpenPositions } = getCurrentData();

  return (
    <PageLayout maxWidth="1200px">
      <div className="portfolio-container" style={{ maxWidth: '1000px', width: '100%' }}>
        <TabNavigation
          tabs={[
            { id: "open", label: "Open Positions" },
            { id: "closed", label: "Closed Positions" },
            { id: "all", label: "All Orders" }
          ]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        <div className="portfolio-tab-content">
          {activeTab === "all" ? (
            <AllOrdersList 
              orders={allOrders || []} 
              isLoading={isAllOrdersLoading} 
              error={ordersError || undefined} 
            />
          ) : (
            renderPositions(currentData as PortfolioPosition[], currentLoading, currentError, isOpenPositions)
          )}
        </div>
      </div>
    </PageLayout>
  );
};

export default Portfolio;
