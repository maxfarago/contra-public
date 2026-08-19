import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import PageLayout from "../components/layout/PageLayout";
import BuyForm from "../components/forms/BuyForm";
import SellForm from "../components/forms/SellForm";
import CountersellForm from "../components/forms/CountersellForm";
import Loader from "../components/ui/Loader";
import TokenInfo from "../components/token/TokenInfo";
import Logs from "../components/trading/Logs";
import BuySellToggle from "../components/ui/BuySellToggle";
import SummaryStats from "../components/token/SummaryStats";
import TabNavigation from "../components/ui/TabNavigation";
import CountersellOrdersTable from "../components/trading/CountersellOrdersTable";
import OrderHistory from "../components/trading/OrderHistory";

import { useTokenDetailData } from "../hooks/api/useTokenDetailData";
import { useOrderManagement } from "../hooks/trading/useOrderManagement";
import { useFormState } from "../hooks/trading/useFormState";

import { useTokenDetailCalculations } from "../lib/utils/calculations";
import { useTokenInfoEffects } from "../lib/utils/effects";
import { api } from "../lib/api";
import { useQueryClient } from "@tanstack/react-query";

import { FiTerminal as TerminalIcon } from "react-icons/fi";
import { IoSwapHorizontal as TradeIcon } from "react-icons/io5";
import { GiMoneyStack as ScalpIcon } from "react-icons/gi";
import BottomTabNavigation from "../components/ui/BottomTabNavigation";
import Modal from "../components/ui/Modal";


const TokenDetail: React.FC = () => {
  const { tokenAddress } = useParams<{ tokenAddress: string }>();
  const [activeTab, setActiveTab] = useState("active");
  const [formMode, setFormMode] = useState<"buy" | "sell">("buy");
  const [expandedOrderLogs, setExpandedOrderLogs] = useState<Set<string>>(new Set());
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [mobileTab, setMobileTab] = useState<"trade" | "position">("trade");
  const [isCountersellModalOpen, setIsCountersellModalOpen] = useState(false);
  const queryClient = useQueryClient();

  // Custom hooks
  const { tokenInfo, walletData, solBalanceData, positionData, isTokenInfoLoading, isPositionDataLoading } = 
    useTokenDetailData(tokenAddress);
  
  const {
    amountToBuy,
    setAmountToBuy,
    amountToSell,
    setAmountToSell,
    buyError,
    sellError,
    formOrders,
    handleOrderChange,
    handlePresetClick,
    addOrder,
    removeOrder,
    resetForm,
  } = useFormState();
  
  const { runCreateTrade, isProcessingOrder, handleCancelOrder, cancellingOrderId, orderError } = 
    useOrderManagement(tokenAddress, resetForm);

  const {
    holdingInWallet,
    isBalanceInsufficient,
    isSellBalanceInsufficient,
    estimatedTokens,
    activeOrders,
    pastOrders,
    logs,
    hasWelcomeLogs,
    summaryStatsData,
  } = useTokenDetailCalculations(
    tokenInfo,
    walletData,
    solBalanceData,
    positionData,
    amountToBuy,
    amountToSell,
    tokenAddress
  );

  const { copied, priceColor, handleCopy } = useTokenInfoEffects(tokenInfo);

  // This single useEffect now manages the token balance.
  // It sets the balance when holdingInWallet is available,
  // and resets it to 0 when holdingInWallet is undefined (e.g., on navigation).
  useEffect(() => {
    setTokenBalance(holdingInWallet?.balance || 0);
  }, [holdingInWallet]);

  // Reset form inputs when the token address changes.
  // We've removed setTokenBalance(0) from here.
  useEffect(() => {
    resetForm("buy");
    resetForm("sell");
    resetForm("countersell");
  }, [tokenAddress, resetForm]);

  // Poll logs every second when there are active orders
  useEffect(() => {
    if (!tokenAddress || activeOrders.length === 0) return;

    const pollLogs = async () => {
      try {
        const response = await api.get(`/positions/${tokenAddress}/logs`);
        // Update the positions cache with fresh logs
        queryClient.setQueryData(["positions", tokenAddress], (oldData: any) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            logs: response.data
          };
        });
      } catch (error) {
        console.error("Failed to fetch logs:", error);
      }
    };

    // Poll immediately, then every second
    pollLogs();
    const interval = setInterval(pollLogs, 1000);

    return () => clearInterval(interval);
  }, [tokenAddress, activeOrders.length, queryClient]);


  // Form validation
  const isCountersellFormIncomplete =
    (!holdingInWallet && tokenBalance <= 0) ||
    formOrders.some(
      (o) =>
        !o.max_percentage_to_sell ||
        !o.target_mcap_usd ||
        !o.buy_threshold_sol ||
        !o.sell_percentage
    );

  // Handlers
  const handleBuySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenAddress || !amountToBuy) return;
    runCreateTrade({
      token_mint: tokenAddress,
      type: "OneShotBuy",
      amount_sol: parseFloat(amountToBuy),
    });
    // Form reset now happens in useOrderManagement onSuccess callback
  };

  const handleSellSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenAddress || !amountToSell) return;
    runCreateTrade({
      token_mint: tokenAddress,
      type: "OneShotSell",
      amount_tokens: parseFloat(amountToSell),
    });
    // Form reset now happens in useOrderManagement onSuccess callback
  };

  const handleCountersellSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check if user has holdings (either from holdingInWallet or tokenBalance)
    if (!holdingInWallet && tokenBalance <= 0) return;

    // Use the first order's values for the flat payload structure
    const firstOrder = formOrders[0];
    if (!firstOrder) return;

    // early exit if no token mint
    const tokenMint = holdingInWallet?.address || tokenAddress;
    if (!tokenMint) return;
    
    // Use holdingInWallet if available, otherwise use tokenBalance for calculations
    const initialTokens = holdingInWallet?.balance || tokenBalance;


    const newTradeData = {
      type: "Countersell",
      token_mint: tokenMint,
      initial_tokens: initialTokens,
      max_percentage_to_sell: parseFloat(firstOrder.max_percentage_to_sell),
      target_mcap_usd: parseFloat(firstOrder.target_mcap_usd),
      buy_threshold_sol: parseFloat(firstOrder.buy_threshold_sol),
      sell_percentage: parseFloat(firstOrder.sell_percentage),
    };
    runCreateTrade(newTradeData);
    // Form reset now happens in useOrderManagement onSuccess callback
  };

  const toggleOrderLogs = (orderId: string) => {
    setExpandedOrderLogs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  // --- Render Logic ---
  if ((isTokenInfoLoading && !tokenInfo) || (isPositionDataLoading && !positionData)) {
    return (
      <PageLayout>
        <div className="loading-container">
          <Loader text="Loading token details..." hideSpinner={true} />
        </div>
      </PageLayout>
    );
  }

  if (!tokenInfo) {
    return (
      <PageLayout>
        <p>Token not found.</p>
      </PageLayout>
    );
  }


  return (
    <PageLayout maxWidth="1400px">
      <div className="token-detail-grid">
        {/* Mobile: Always show TokenInfo at top */}
        <div className="token-detail-mobile-header">
          <TokenInfo
            tokenInfo={tokenInfo}
            priceColor={priceColor}
            copied={copied}
            onCopy={handleCopy}
          />
        </div>

        {/* Desktop Left Column / Mobile Trade Tab Content */}
        <article className={`token-detail-left-column ${mobileTab !== "trade" ? "token-detail-mobile-hidden" : ""}`}>
          {/* Desktop: Show TokenInfo here too */}
          <div className="token-detail-desktop-header">
            <TokenInfo
              tokenInfo={tokenInfo}
              priceColor={priceColor}
              copied={copied}
              onCopy={handleCopy}
            />
          </div>
          
          <BuySellToggle
            activeMode={formMode}
            onModeChange={setFormMode}
            className="token-detail-toggle"
          />

          {formMode === "buy" ? (
            <BuyForm
              onSubmit={handleBuySubmit}
              amountToBuy={amountToBuy}
              setAmountToBuy={setAmountToBuy}
              solBalanceData={solBalanceData}
              isBalanceInsufficient={isBalanceInsufficient}
              isPending={isProcessingOrder && formMode === "buy"}
              buyError={buyError}
              orderError={orderError}
              estimatedTokens={estimatedTokens}
              tokenSymbol={tokenInfo.symbol}
              isActive={true}
              tokenBalance={tokenBalance}
              walletData={walletData}
            />
          ) : (
            <SellForm
              onSubmit={handleSellSubmit}
              amountToSell={amountToSell}
              setAmountToSell={setAmountToSell}
              solBalanceData={solBalanceData}
              isBalanceInsufficient={isSellBalanceInsufficient}
              isPending={isProcessingOrder && formMode === "sell"}
              sellError={sellError}
              orderError={orderError}
              tokenSymbol={tokenInfo.symbol}
              tokenBalance={tokenBalance}
              isActive={true}
              walletData={walletData}
            />
          )}

        </article>

        {/* Desktop Right Column / Mobile Position Tab Content */}
        <article className={`token-detail-right-column ${mobileTab !== "position" ? "token-detail-mobile-hidden" : ""}`}>
          {/* Row 1: Summary Stats - Only show if position data exists */}
          {positionData && (
            <>
              <SummaryStats
                title="Position Summary"
                headers={summaryStatsData.headers}
                values={summaryStatsData.values}
              />
              <hr className="token-detail-divider" />
            </>
          )}

          {/* Row 2: Order List with Toggle */}
          <div className="token-detail-orders-section">
            <TabNavigation
              tabs={[
                { id: "active", label: "Open Orders" },
                { id: "past", label: "Closed Orders" }
              ]}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />

            <div className="pt-6">
              {activeTab === "active" && (
                <div>
                  {activeOrders.length > 0 && (
                  <>
                    <CountersellOrdersTable
                      orders={activeOrders}
                      onCancelOrder={handleCancelOrder}
                      cancellingOrderId={cancellingOrderId}
                    />
                    
                    <hr className="token-detail-divider" />
                  </>)}
                  
                  {/* Mobile CTA Button */}
                  <div className="token-detail-mobile-cta">
                    <button
                      className="token-detail-add-countersell-button"
                      onClick={() => setIsCountersellModalOpen(true)}
                      type="button"
                      disabled={!holdingInWallet && tokenBalance <= 0}
                    >
                      {(!holdingInWallet && tokenBalance <= 0)
                        ? `Buy $${tokenInfo.symbol} to Scalp`
                        : 'Add Scalping Order'}
                    </button>
                  </div>
                  
                  {/* Desktop Countersell Form - Only in Open tab */}
                  <div className="token-detail-countersell-section">
                    <CountersellForm
                      orders={formOrders}
                      onSubmit={handleCountersellSubmit}
                      onOrderChange={handleOrderChange}
                      onPresetClick={handlePresetClick}
                      addOrder={addOrder}
                      removeOrder={removeOrder}
                      isPending={isProcessingOrder}
                      isSuccess={false}
                      isFormIncomplete={isCountersellFormIncomplete}
                      holding={holdingInWallet ?? null}
                      tokenBalance={tokenBalance}
                      solBalanceData={solBalanceData}
                      currentMarketCap={tokenInfo.market_cap?.valueUsd}
                      hasHoldings={!!holdingInWallet || tokenBalance > 0}
                      activeOrdersCount={activeOrders.length}
                    />
                  </div>

                  {/* Execution Logs - Always show */}
                  <div className="token-detail-logs-subsection">
                      <div className="token-detail-logs-header">
                        <TerminalIcon size={18} /><h3>Position Logs</h3>
                      </div>
                    <Logs logs={logs} hasWelcomeLogs={hasWelcomeLogs} />
                  </div>
                </div>
              )}

              {activeTab === "past" && (
                <OrderHistory
                  orders={pastOrders}
                  tokenInfo={tokenInfo}
                  expandedOrderLogs={expandedOrderLogs}
                  onToggleOrderLogs={toggleOrderLogs}
                  allLogs={logs}
                />
              )}
            </div>
          </div>

        </article>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomTabNavigation
        tabs={[
          { id: "trade", label: "Trade", icon: <TradeIcon /> },
          { id: "position", label: "Scalp", icon: <ScalpIcon /> },
        ]}
        activeTab={mobileTab}
        onTabChange={(tabId) => setMobileTab(tabId as "trade" | "position")}
      />

      {/* Mobile Countersell Modal */}
      <Modal
        isOpen={isCountersellModalOpen}
        onClose={() => setIsCountersellModalOpen(false)}
        size="full"
        showCloseButton={true}
        className="countersell-modal"
      >
        <div className="countersell-modal-header">
          <h2>Add Scalping Order</h2>
        </div>
        <div className="countersell-modal-body">
          <CountersellForm
            orders={formOrders}
            onSubmit={(e) => {
              handleCountersellSubmit(e);
              setIsCountersellModalOpen(false);
            }}
            onOrderChange={handleOrderChange}
            onPresetClick={handlePresetClick}
            addOrder={addOrder}
            removeOrder={removeOrder}
            isPending={isProcessingOrder}
            isSuccess={false}
            isFormIncomplete={isCountersellFormIncomplete}
            holding={holdingInWallet ?? null}
            tokenBalance={tokenBalance}
            solBalanceData={solBalanceData}
            currentMarketCap={tokenInfo.market_cap?.valueUsd}
            hasHoldings={!!holdingInWallet || tokenBalance > 0}
            activeOrdersCount={activeOrders.length}
          />
        </div>
      </Modal>
    </PageLayout>
  );
};

export default TokenDetail;
