const SOL_MINT = 'So11111111111111111111111111111111111111112';
const LAMPORTS_PER_SOL = 1e9;

/**
 * Calculates detailed P&L and other metrics for a single position.
 * @param {object} position - The raw position object from the database.
 * @param {object} priceData - An object mapping mint addresses to their price info from Jupiter.
 * @returns {object} The fully calculated position object for the API response.
 */
export function calculatePositionMetrics (position, priceData) {
  const solPriceUsd = priceData[SOL_MINT]?.usdPrice || 0;
  const currentTokenPriceUsd = priceData[position.token_mint]?.usdPrice || 0;
  const decimals = position.decimals || 0;
  const microtokenFactor = 10 ** decimals;

  // --- Convert Base DB Values (from Lamports to SOL and USD) ---
  const totalBoughtSol = (position.total_bought_lamports || 0) / LAMPORTS_PER_SOL;
  const totalSoldSol = (position.total_sold_lamports || 0) / LAMPORTS_PER_SOL;
  const realizedPnlSolBase = parseFloat(position.realized_pnl_lamports || 0) / LAMPORTS_PER_SOL;

  const totalBoughtUsd = totalBoughtSol * solPriceUsd;
  const totalSoldUsd = totalSoldSol * solPriceUsd;
  const realizedPnlUsd = realizedPnlSolBase * solPriceUsd;

  const totalBoughtTokens = (position.total_bought_microtokens || 0) / microtokenFactor;
  const totalSoldTokens = (position.total_sold_microtokens || 0) / microtokenFactor;

  // --- Calculate Current Holdings and Unrealized PnL ---
  const currentHoldingsTokens = (position.current_holdings_microtokens || 0) / microtokenFactor;
  const currentBalanceUsd = currentHoldingsTokens * currentTokenPriceUsd;
  const avgBuyPriceUsd = totalBoughtTokens > 0 ? totalBoughtUsd / totalBoughtTokens : 0;
  const avgBuyPriceSol = totalBoughtTokens > 0 ? totalBoughtSol / totalBoughtTokens : 0;
  const costBasisOfHoldingsUsd = currentHoldingsTokens * avgBuyPriceUsd;
  const unrealizedPnlUsd = currentBalanceUsd - costBasisOfHoldingsUsd;

  // --- Calculate Cost Basis of Tokens Sold ---
  const costBasisOfTokensSoldUsd = totalSoldTokens * avgBuyPriceUsd;

  // --- Calculate Final Totals ---
  const totalProfitUsd = unrealizedPnlUsd + realizedPnlUsd;
  const unrealizedPnlSol = solPriceUsd > 0 ? unrealizedPnlUsd / solPriceUsd : 0;
  const realizedPnlSol = realizedPnlSolBase;
  const totalProfitSol = unrealizedPnlSol + realizedPnlSol;

  // --- Format for UI Response ---
  return {
    token: {
      name: position.token_name,
      symbol: position.token_symbol,
      mint: position.token_mint,
      imageUrl: position.token_image_url
    },
    balance: {
      tokens: currentHoldingsTokens,
      valueUsd: currentBalanceUsd,
      valueSol: solPriceUsd > 0 ? currentBalanceUsd / solPriceUsd : 0
    },
    unrealizedPnl: {
      valueUsd: unrealizedPnlUsd,
      valueSol: unrealizedPnlSol,
      percentage: costBasisOfHoldingsUsd > 0 ? unrealizedPnlUsd / costBasisOfHoldingsUsd : 0
    },
    realizedPnl: {
      valueUsd: realizedPnlUsd,
      valueSol: realizedPnlSol,
      percentage: costBasisOfTokensSoldUsd > 0 ? realizedPnlUsd / costBasisOfTokensSoldUsd : 0
    },
    bought: {
      totalValueUsd: totalBoughtUsd,
      totalValueSol: totalBoughtSol,
      avgPriceUsd: avgBuyPriceUsd,
      avgPriceSol: avgBuyPriceSol
    },
    sold: {
      totalValueUsd: totalSoldUsd,
      totalValueSol: totalSoldSol,
      avgPriceUsd: totalSoldTokens > 0 ? totalSoldUsd / totalSoldTokens : 0,
      avgPriceSol: totalSoldTokens > 0 ? totalSoldSol / totalSoldTokens : 0
    },
    totalProfit: {
      valueUsd: totalProfitUsd,
      valueSol: totalProfitSol,
      percentage: totalBoughtUsd > 0 ? totalProfitUsd / totalBoughtUsd : 0
    },
    transactionCounts: {
      buyCount: position.buy_tx_count || 0,
      sellCount: position.sell_tx_count || 0
    }
  };
}
