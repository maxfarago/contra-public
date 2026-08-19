// API endpoint functions
import { Holding, WalletData, WalletSolResponse } from "../../types";
import { api } from "./client";

export const fetchTokenInfo = async (
  tokenAddress: string
): Promise<Holding> => {
  const { data } = await api.get(`/token/${tokenAddress}`);
  return data;
};

export const fetchWalletData = async (): Promise<WalletData> => {
  const { data } = await api.get("/wallet");
  return data;
};

export const fetchSolBalance = async (): Promise<WalletSolResponse> => {
  const { data } = await api.get("/wallet/sol");
  return data;
};

