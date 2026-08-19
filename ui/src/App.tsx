import React from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";

import { usePageTracking } from "./hooks/analytics/usePageTracking";
import { CurrencyProvider } from "./contexts/CurrencyContext";

import ProtectedRoute from "./components/shared/ProtectedRoute";
import AppLayout from "./components/layout/AppLayout";
import WalletSetup from "./components/wallet/WalletSetup";
import Home from "./pages/Home";
import Portfolio from "./pages/Portfolio";
import TokenDetail from "./pages/TokenDetail";
import Forbidden from "./pages/Forbidden";
import NotFound from "./pages/NotFound";

const App: React.FC = () => {
  // track page views automatically
  usePageTracking();

  return (
    <CurrencyProvider>
      <Routes>
        <Route path="/forbidden" element={<Forbidden />} />

        {/* protected routes */}
        <Route element={<ProtectedRoute />}>
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
          {/* Onboarding route does not use the main AppLayout */}
          <Route path="welcome" element={<WalletSetup />} />
        </Route>
      </Routes>
    </CurrencyProvider>
  );
};

export default App;
