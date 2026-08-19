import React, { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import Loader from "../ui/Loader";

const ProtectedRoute: React.FC = () => {
  const { isAuthenticated, isLoading, isLoggingOut } = useAuth();

  useEffect(() => {
    // if the session is done loading and the user is not authenticated, redirect them
    // but don't redirect if we're in the process of logging out
    if (!isLoading && !isAuthenticated && !isLoggingOut) {
      window.location.href = "/";
    }
  }, [isAuthenticated, isLoading, isLoggingOut]);

  // while the session is loading, we can show a loader
  if (isLoading) {
    return <Loader text="loading session..." />;
  }

  // if authenticated, render the child routes
  return isAuthenticated ? <Outlet /> : null;
};

export default ProtectedRoute;
