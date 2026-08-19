import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCurrency } from '../../contexts/CurrencyContext';
import { formatLargeNumber } from '../../lib/formatters';
import { useFormState } from '../../hooks/trading/useFormState';
import { useOrderManagement } from '../../hooks/trading/useOrderManagement';
import { WalletData, WalletSolResponse } from '../../types';
import { api } from '../../lib/api';
import TokenInfo from '../token/TokenInfo';
import BuySellToggle from '../ui/BuySellToggle';
import SmartInput from '../forms/SmartInput';
import BuySellButton from '../forms/BuySellButton';
import AtlasHoldingsInfo from './AtlasHoldingsInfo';
import { EnrichedTokenData } from './types';
import { mapTokenDataToHolding, formatAge } from './utils';

interface AtlasHUDProps {
  selectedToken: EnrichedTokenData | null;
  tokenCount: number;
  migratedTokenCount: number;
  aboveGraduationCount: number;
  mayhemTokenCount: number;
  isWalletHot: boolean | null;
  onTokenChange: (token: EnrichedTokenData | null) => void;
}

const fetchWalletData = async (): Promise<WalletData> => {
  const { data } = await api.get("/wallet");
  return data;
};

const fetchSolBalance = async (): Promise<WalletSolResponse> => {
  const { data } = await api.get("/wallet/sol");
  return data;
};

export const AtlasHUD = ({ selectedToken, tokenCount, migratedTokenCount, aboveGraduationCount, mayhemTokenCount, isWalletHot, onTokenChange }: AtlasHUDProps) => {
  const { currency } = useCurrency();
  const [isCopied, setIsCopied] = useState(false);
  const [formMode, setFormMode] = useState<"buy" | "sell">("buy");

  // debug wallet hot status changes
  useEffect(() => {
    console.log('[AtlasHUD] isWalletHot changed:', isWalletHot);
  }, [isWalletHot]);
  const [changeDirections, setChangeDirections] = useState({ mcap: 'neutral', vol: 'neutral', txs: 'neutral' });
  const prevSelectedTokenData = useRef<EnrichedTokenData | null>(null);
  
  const { data: walletData } = useQuery<WalletData, Error>({
    queryKey: ["wallet"],
    queryFn: fetchWalletData,
  });

  const { data: solBalanceData } = useQuery<WalletSolResponse>({
    queryKey: ["solBalance"],
    queryFn: fetchSolBalance,
  });

  const {
    amountToBuy,
    setAmountToBuy,
    amountToSell,
    setAmountToSell,
    buyError,
    sellError,
    resetForm,
  } = useFormState();

  const { runCreateTrade, isProcessingOrder, orderError } = 
    useOrderManagement(selectedToken?.mint, resetForm);

  const holdingInWallet = selectedToken && walletData
    ? walletData.holdings.find((h) => h.address === selectedToken.mint)
    : undefined;

  const isBalanceInsufficient = solBalanceData?.balance && amountToBuy
    ? parseFloat(amountToBuy) > solBalanceData.balance
    : false;

  const isSellBalanceInsufficient = holdingInWallet && amountToSell
    ? parseFloat(amountToSell) > holdingInWallet.balance
    : false;

  const estimatedTokens = null; // placeholder

  useEffect(() => {
    setIsCopied(false);
    resetForm("buy");
    resetForm("sell");
  }, [selectedToken?.mint, resetForm]);

  useEffect(() => {
    if (selectedToken && prevSelectedTokenData.current && selectedToken.mint === prevSelectedTokenData.current.mint) {
      setChangeDirections(prevDirections => {
        const newDirections = { ...prevDirections };
        let hasChanged = false;

        const checkMetric = (
          metric: 'mcap' | 'vol' | 'txs',
          key: 'market_cap' | 'volume' | 'tx_count'
        ) => {
          if (prevDirections[metric] === 'neutral') {
            const currentValue = selectedToken[key] ?? 0;
            const prevValue = prevSelectedTokenData.current![key] ?? 0;
            let direction: 'positive' | 'negative' | 'neutral' = 'neutral';

            if (currentValue > prevValue) direction = 'positive';
            if (currentValue < prevValue) direction = 'negative';
            
            if (direction !== 'neutral') {
              newDirections[metric] = direction;
              hasChanged = true;
            }
          }
        };

        checkMetric('mcap', 'market_cap');
        checkMetric('vol', 'volume');
        checkMetric('txs', 'tx_count');

        return hasChanged ? newDirections : prevDirections;
      });
    }
    
    prevSelectedTokenData.current = selectedToken;
  }, [selectedToken]);

  const handleAnimationEnd = (metric: 'mcap' | 'vol' | 'txs') => {
    setChangeDirections(prev => ({ ...prev, [metric]: 'neutral' }));
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const formatMarketCap = () => {
    if (!selectedToken) return 'Loading...';
    const value = currency === 'USD'
      ? selectedToken.market_cap_usd
      : selectedToken.market_cap;
    if (value === undefined || value === null) return '-';
    const prefix = currency === 'USD' ? '$' : '';
    const suffix = currency === 'SOL' ? ' SOL' : '';
    return `${prefix}${formatLargeNumber(value)}${suffix}`;
  };

  const formatVolume = () => {
    if (!selectedToken) return 'Loading...';
    const value = currency === 'USD' 
      ? selectedToken.volume_usd 
      : selectedToken.volume;
    if (value === undefined || value === null) return '-';
    const prefix = currency === 'USD' ? '$' : '';
    const suffix = currency === 'SOL' ? ' SOL' : '';
    return `${prefix}${formatLargeNumber(value)}${suffix}`;
  };

  const handleBuySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedToken || !amountToBuy) return;
    runCreateTrade({
      token_mint: selectedToken.mint,
      type: "OneShotBuy",
      amount_sol: parseFloat(amountToBuy),
    });
  };

  const handleSellSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedToken || !amountToSell) return;
    runCreateTrade({
      token_mint: selectedToken.mint,
      type: "OneShotSell",
      amount_tokens: parseFloat(amountToSell),
    });
  };

  const handlePresetClick = (value: string | number) => {
    if (formMode === "sell" && holdingInWallet) {
      const percentage = typeof value === 'string' 
        ? parseFloat(value.replace('%', '')) 
        : value;
      if (!isNaN(percentage) && holdingInWallet.balance) {
        const amount = holdingInWallet.balance * (percentage / 100);
        setAmountToSell(amount.toString());
      }
    }
  };

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'escape') {
        onTokenChange(null);
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [onTokenChange]);

  return (
    <div className="hud">
      <div className="container hud-layout">
        <div className="hud-row hud-token-info">
          {selectedToken ? (
            <>
              <TokenInfo
                tokenInfo={mapTokenDataToHolding(selectedToken)}
                priceColor="#dddddd"
                copied={isCopied}
                onCopy={handleCopy}
                showCopyButton={true}
                variant="portfolio"
              />
              <div className="hud-metrics-group">
                <div className="hud-item">
                  <span className="hud-label">mcap</span>
                  <span
                    onAnimationEnd={() => handleAnimationEnd('mcap')}
                    className={`hud-value ${changeDirections.mcap}`}
                  >
                    {formatMarketCap()}
                  </span>
                </div>
                <div className="hud-item">
                  <span className="hud-label">vol</span>
                  <span
                    onAnimationEnd={() => handleAnimationEnd('vol')}
                    className={`hud-value ${changeDirections.vol}`}
                  >
                    {formatVolume()}
                  </span>
                </div>
                {selectedToken.tx_count != null && (
                  <div className="hud-item hud-item--txs">
                    <span className="hud-label">txs</span>
                    <span
                      onAnimationEnd={() => handleAnimationEnd('txs')}
                      className={`hud-value ${changeDirections.txs}`}
                    >
                      {Math.round(selectedToken.tx_count).toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="hud-item hud-item--age">
                  <span className="hud-label">age</span>
                  <span className="hud-value">{formatAge(selectedToken.age)}</span>
                </div>
              </div>
              <div className="hud-trading-group">
                <form 
                  onSubmit={formMode === "buy" ? handleBuySubmit : handleSellSubmit}
                  className="hud-trading-form"
                >
                  <div className="hud-trading-form__left">
                    {formMode === "buy" ? (
                      <SmartInput
                        name="amountToBuy"
                        value={amountToBuy}
                        onChange={(e) => setAmountToBuy(e.target.value)}
                        suffix="SOL"
                        mode="presets"
                        presetValues={[0.01, 0.1, 0.5, 1]}
                        required
                        isError={isBalanceInsufficient}
                        condensed={true}
                        className="hud-smart-input"
                      />
                    ) : (
                      <SmartInput
                        name="amountToSell"
                        value={amountToSell}
                        onChange={(e) => setAmountToSell(e.target.value)}
                        suffix={selectedToken.symbol || ""}
                        mode="presets"
                        presetValues={["25%", "50%", "75%", "100%"]}
                        onPresetClick={handlePresetClick}
                        required
                        isError={isSellBalanceInsufficient}
                        condensed={true}
                        className="hud-smart-input"
                      />
                    )}
                    {(buyError || sellError || orderError) && (
                      <p className="hud-error">{buyError || sellError || orderError}</p>
                    )}
                  </div>
                  <div className="hud-trading-form__right">
                    <BuySellToggle
                      activeMode={formMode}
                      onModeChange={setFormMode}
                      className="hud-toggle"
                    />
                    {formMode === "buy" ? (
                      <BuySellButton
                        type="buy"
                        isPending={isProcessingOrder && formMode === "buy"}
                        isDisabled={isBalanceInsufficient || !amountToBuy || isProcessingOrder || !selectedToken || isWalletHot === false}
                        tokenSymbol={selectedToken.symbol}
                        amount={amountToBuy}
                        estimatedTokens={estimatedTokens}
                        className="hud-cta-button"
                        overrideLabel={
                          isBalanceInsufficient 
                            ? "Low Balance" 
                            : isWalletHot === false 
                            ? "Wallet Not Connected" 
                            : undefined
                        }
                      />
                    ) : (
                      <BuySellButton
                        type="sell"
                        isPending={isProcessingOrder && formMode === "sell"}
                        isDisabled={isSellBalanceInsufficient || !amountToSell || isProcessingOrder || !selectedToken || isWalletHot === false}
                        tokenSymbol={selectedToken.symbol}
                        amount={amountToSell}
                        className="hud-cta-button"
                        overrideLabel={
                          isSellBalanceInsufficient 
                            ? "insufficient token balance" 
                            : isWalletHot === false 
                            ? "Wallet Not Connected" 
                            : undefined
                        }
                      />
                    )}
                  </div>
                </form>
              </div>
              {selectedToken.holding && <AtlasHoldingsInfo holding={selectedToken.holding} />}
            </>
          ) : (
            <div className="hud-placeholder">hover over a token to view details</div>
          )}
        </div>
        <div className="hud-row hud-market-info">
          <div className="pumpfun-brand">
            <img src="/icons/pumpfun.png" alt="Pump.fun" className="pumpfun-logo" />
            <span className="pumpfun-text">Pump.fun</span>
          </div>
          <div className="token-counter">
            <span className="counter-value">{tokenCount.toLocaleString()}</span>
            <span className="counter-label">tokens tracked</span>
          </div>
          <div className="token-counter">
            <span className="counter-value" style={{ color: 'rgb(255, 170, 0)' }}>{migratedTokenCount.toLocaleString()}</span>
            <span className="counter-label">tokens graduated</span>
          </div>
          <div className="token-counter">
            <span className="counter-value">{aboveGraduationCount.toLocaleString()}</span>
            <span className="counter-label">tokens above graduation mc</span>
          </div>
          <div className="token-counter">
            <span className="counter-value" style={{ color: 'rgb(255, 0, 0)' }}>{mayhemTokenCount.toLocaleString()}</span>
            <span className="counter-label">mayhem tokens</span>
          </div>
        </div>
      </div>
    </div>
  );
};

