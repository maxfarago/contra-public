import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { IoSearch } from "react-icons/io5";
import { api } from "../../lib/api";
import { Holding } from "../../types";
import TokenInfo from "./TokenInfo";
import { useCurrency } from "../../contexts/CurrencyContext";

// --- API Fetcher ---
const fetchTokenInfo = async (tokenAddress: string): Promise<Holding> => {
  const { data } = await api.get(`/token/${tokenAddress}`);
  // Manually add the address to the response to ensure data consistency
  return { ...data, address: tokenAddress };
};

interface TokenSearchProps {
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  onTokenSelect?: (token: Holding) => void;
}

const TokenSearch: React.FC<TokenSearchProps> = ({
  placeholder = "Search for a token...",
  autoFocus = true,
  className = "",
  onTokenSelect,
}) => {
  const [tokenAddress, setTokenAddress] = useState("");
  const [debouncedTokenAddress, setDebouncedTokenAddress] = useState("");
  const [copied, setCopied] = useState(false);
  const [priceColor, setPriceColor] = useState("white");
  const prevPriceRef = useRef<number>();
  const prevMarketCapRef = useRef<number>();
  const inputRef = useRef<HTMLInputElement>(null);
  const { currency } = useCurrency();

  // Auto-focus input on mount
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Debounce input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedTokenAddress(tokenAddress);
    }, 500);
    return () => clearTimeout(handler);
  }, [tokenAddress]);

  // --- Data Fetching ---
  const {
    data: tokenInfo,
    isLoading: isTokenInfoLoading,
    isError: isTokenInfoError,
  } = useQuery<Holding, Error>({
    queryKey: ["tokenInfo", debouncedTokenAddress],
    queryFn: () => fetchTokenInfo(debouncedTokenAddress),
    enabled: !!debouncedTokenAddress,
    retry: false,
    refetchInterval: 10000,
  });

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

  const handleTokenClick = () => {
    if (tokenInfo && onTokenSelect) {
      onTokenSelect(tokenInfo);
    }
  };

  return (
    <div className={`token-search ${className}`}>
      <div className="token-search__container">
        <div>
          <div className="token-search__input-container">
            <div className="token-search__input-wrapper">
              <IoSearch className="token-search__icon" />
              <input
                ref={inputRef}
                type="search"
                id="tokenAddress"
                name="tokenAddress"
                placeholder={placeholder}
                value={tokenAddress}
                onChange={(e) => setTokenAddress(e.target.value)}
                className={`token-search__input ${
                  tokenInfo ? "token-search__input--with-result" : ""
                }`}
              />
            </div>
          </div>
          {isTokenInfoError && debouncedTokenAddress && (
            <p className="token-search__error">
              Token not found.
            </p>
          )}
        </div>

        {isTokenInfoLoading && debouncedTokenAddress ? (
          <div className="token-search__result token-search__result--loading">
            <span aria-busy="true" className="loader-spinner small" />
            <span className="token-search__loading-text">Searching...</span>
          </div>
        ) : tokenInfo ? (
          <>
            {onTokenSelect ? (
              <div
                className="token-search__result"
                onClick={handleTokenClick}
              >
                <TokenInfo
                  tokenInfo={tokenInfo}
                  priceColor={priceColor}
                  copied={copied}
                  onCopy={handleCopy}
                  showCopyButton={false}
                />
              </div>
            ) : (
              <Link
                to={`/portfolio/${tokenInfo.address}`}
                className="token-search__result"
              >
                <TokenInfo
                  tokenInfo={tokenInfo}
                  priceColor={priceColor}
                  copied={copied}
                  onCopy={handleCopy}
                  showCopyButton={false}
                />
              </Link>
            )}
          </>
        ) : (
          <div className="token-search__result token-search__result--placeholder">
            {/* Transparent placeholder to maintain layout */}
          </div>
        )}
      </div>
    </div>
  );
};

export default TokenSearch;
