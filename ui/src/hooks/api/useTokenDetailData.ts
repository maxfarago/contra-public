import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { api } from "../../lib/api";
import { Holding, WalletData, WalletSolResponse, PositionData } from "../../types";

// API fetchers
const fetchTokenInfo = async (tokenAddress: string): Promise<Holding> => {
  const { data } = await api.get(`/token/${tokenAddress}`);
  return { ...data, address: tokenAddress };
};

const fetchWalletData = async (): Promise<WalletData> => {
  const { data } = await api.get("/wallet");
  return data;
};

const fetchSolBalance = async (): Promise<WalletSolResponse> => {
  const { data } = await api.get("/wallet/sol");
  return data;
};

const fetchPositions = async (tokenMint: string): Promise<PositionData> => {
  const { data } = await api.get(`/positions/${tokenMint}`);
  return data;
};

export const useTokenDetailData = (tokenAddress: string | undefined) => {
  const [requestCount, setRequestCount] = useState(0);
  const [isPageVisible, setIsPageVisible] = useState(true);

  // Token info query
  const { data: tokenInfo, isLoading: isTokenInfoLoading } = useQuery<
    Holding,
    Error
  >({
    queryKey: ["tokenInfo", tokenAddress],
    queryFn: () => {
      setRequestCount((prev) => prev + 1);
      return fetchTokenInfo(tokenAddress!);
    },
    enabled: !!tokenAddress && isPageVisible && requestCount < 100,
    refetchInterval: 10000,
  });

  // Wallet data query
  const { data: walletData } = useQuery<WalletData, Error>({
    queryKey: ["wallet"],
    queryFn: fetchWalletData,
  });

  // SOL balance query
  const { data: solBalanceData } = useQuery<WalletSolResponse>({
    queryKey: ["solBalance"],
    queryFn: fetchSolBalance,
  });

  // Position data query
  const {
    data: positionData,
    isLoading: isPositionDataLoading,
  } = useQuery<PositionData, Error>({
    queryKey: ["positions", tokenAddress],
    queryFn: () => fetchPositions(tokenAddress!),
    enabled: !!tokenAddress,
    retry: (failureCount, error) => {
      // Don't retry on 404 - it just means no position exists
      if (
        error?.message?.includes("404") ||
        error?.message?.includes("Not Found")
      ) {
        return false;
      }
      // Retry other errors up to 3 times
      return failureCount < 3;
    },
  });

  // Page visibility effect
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsPageVisible(!document.hidden);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Reset request count on page refresh/remount
  useEffect(() => {
    setRequestCount(0);
  }, [tokenAddress]);

  return {
    tokenInfo,
    walletData,
    solBalanceData,
    positionData,
    isTokenInfoLoading,
    isPositionDataLoading,
  };
};
