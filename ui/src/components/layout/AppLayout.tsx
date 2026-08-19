import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import Navbar from "./Navbar";
import { api } from "../../lib/api";
import { WalletSolResponse } from "../../types";
import DepositModal from "../wallet/DepositModal";

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [copied, setCopied] = useState(false);

  const { data: walletData } = useQuery<WalletSolResponse>({
    queryKey: ["solBalance"],
    queryFn: async () => {
      const response = await api.get("/wallet/sol");
      return response.data;
    },
    enabled: isAuthenticated,
    refetchInterval: 60000, // 1 min
    staleTime: 60000,
    retry: false,
    refetchOnWindowFocus: false, // Prevent refetching on window focus
  });

  const [isInitialDepositModalOpen, setIsInitialDepositModalOpen] = useState(false);

  // Check for initial deposit requirement
  useEffect(() => {
    if (walletData && walletData.balance === 0) {
      setIsInitialDepositModalOpen(true);
    }
  }, [walletData]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar
        walletData={walletData}
        onCopyWallet={handleCopy}
        copied={copied}
      />
      <main className="main-content">
        {children}
      </main>
      <DepositModal
        isOpen={isInitialDepositModalOpen}
        onClose={() => {
          setIsInitialDepositModalOpen(false);
          // Manually refetch after closing if needed, or rely on interval
        }}
        publicKey={walletData?.publicKey || ""}
        onDepositSuccess={() => {
          setIsInitialDepositModalOpen(false);
          // The query will refetch from the navbar, so we're good.
        }}
      />
    </div>
  );
};

export default AppLayout;
