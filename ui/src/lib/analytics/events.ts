// Predefined event tracking functions for common actions
import { trackEvent } from "./gtag";

export const analytics = {
  // Trading events
  trackBuyOrder: (tokenSymbol: string, amount: number, valueUsd: number) => {
    trackEvent('buy_order', {
      token_symbol: tokenSymbol,
      amount: amount,
      value_usd: valueUsd,
      event_category: 'trading',
    });
  },

  trackSellOrder: (tokenSymbol: string, amount: number, valueUsd: number) => {
    trackEvent('sell_order', {
      token_symbol: tokenSymbol,
      amount: amount,
      value_usd: valueUsd,
      event_category: 'trading',
    });
  },

  trackCountersellOrder: (tokenSymbol: string, maxTokens: number, targetMcap: number) => {
    trackEvent('countersell_order', {
      token_symbol: tokenSymbol,
      max_tokens: maxTokens,
      target_mcap: targetMcap,
      event_category: 'trading',
    });
  },

  trackOrderCancel: (orderId: string, orderType: string) => {
    trackEvent('order_cancel', {
      order_id: orderId,
      order_type: orderType,
      event_category: 'trading',
    });
  },

  // Navigation events
  trackTokenView: (tokenSymbol: string, tokenAddress: string) => {
    trackEvent('token_view', {
      token_symbol: tokenSymbol,
      token_address: tokenAddress,
      event_category: 'navigation',
    });
  },

  trackPortfolioView: () => {
    trackEvent('portfolio_view', {
      event_category: 'navigation',
    });
  },

  // Wallet events
  trackWalletCreation: () => {
    trackEvent('wallet_creation', {
      event_category: 'wallet',
    });
  },

  trackDeposit: (amount: number) => {
    trackEvent('deposit', {
      amount: amount,
      event_category: 'wallet',
    });
  },

  // Error events
  trackError: (errorType: string, errorMessage: string, context?: string) => {
    trackEvent('error', {
      error_type: errorType,
      error_message: errorMessage,
      context: context,
      event_category: 'error',
    });
  },
};

