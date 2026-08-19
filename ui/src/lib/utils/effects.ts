import { useState, useEffect, useRef } from "react";
import { Holding } from "../../types";
import { useCurrency } from "../../contexts/CurrencyContext";

export const useTokenInfoEffects = (tokenInfo?: Holding) => {
  const [copied, setCopied] = useState(false);
  const [priceColor, setPriceColor] = useState("white");
  const prevPriceRef = useRef<number>();
  const prevMarketCapRef = useRef<number>();
  const { currency } = useCurrency();

  // Price flash effect
  useEffect(() => {
    if (tokenInfo?.price_info?.price_per_token) {
      const currentPrice = tokenInfo.price_info.price_per_token;
      const prevPrice = prevPriceRef.current;
      if (prevPrice !== undefined && currentPrice !== prevPrice) {
        const newColor = currentPrice > prevPrice ? "#4CAF50" : "#ff6b6b";
        setPriceColor(newColor);
        const timer = setTimeout(() => setPriceColor("white"), 1500);
        return () => clearTimeout(timer);
      }
      prevPriceRef.current = currentPrice;
    }
  }, [tokenInfo]);

  // Market cap flash effect - now uses same color as price
  useEffect(() => {
    if (tokenInfo?.market_cap) {
      const currentMarketCap = currency === "USD" 
        ? tokenInfo.market_cap.valueUsd
        : tokenInfo.market_cap.valueSol;
      const prevMarketCap = prevMarketCapRef.current;
      if (prevMarketCap !== undefined && currentMarketCap !== prevMarketCap) {
        const newColor =
          currentMarketCap > prevMarketCap ? "#4CAF50" : "#ff6b6b";
        setPriceColor(newColor);
        const timer = setTimeout(() => setPriceColor("white"), 1500);
        return () => clearTimeout(timer);
      }
      prevMarketCapRef.current = currentMarketCap;
    }
  }, [tokenInfo, currency]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return {
    copied,
    priceColor,
    handleCopy,
  };
};
