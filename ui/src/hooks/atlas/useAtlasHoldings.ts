import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

export interface AtlasHolding {
  mint: string;
  quantity: number;
  cost_basis_sol: number;
  cost_basis_usd: number;
}

const fetchAtlasHoldings = async (): Promise<AtlasHolding[]> => {
  const { data } = await api.get("/wallet/atlas");
  return data;
};

export const useAtlasHoldings = () => {
  return useQuery<AtlasHolding[], Error>({
    queryKey: ["atlasHoldings"],
    queryFn: fetchAtlasHoldings,
  });
};

