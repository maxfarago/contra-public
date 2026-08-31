import React from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";

import { CurrencyProvider } from "./contexts/CurrencyContext";

import AppLayout from "./components/layout/AppLayout";
import WalletSetup from "./components/wallet/WalletSetup";
import Home from "./pages/Home";
import Portfolio from "./pages/Portfolio";
import TokenDetail from "./pages/TokenDetail";
import NotFound from "./pages/NotFound";

const App: React.FC = () => {
  return (
    <CurrencyProvider>
      <Routes>
        <Route
          path="/"
          element={
            <AppLayout>
              <Outlet />
            </AppLayout>
          }
        >
          <Route index element={<Navigate to="/home" replace />} />
          <Route path="home" element={<Home />} />
          <Route path="portfolio" element={<Portfolio />} />
          <Route path="portfolio/:tokenAddress" element={<TokenDetail />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="welcome" element={<WalletSetup />} />
      </Routes>
    </CurrencyProvider>
  );
};

export default App;
