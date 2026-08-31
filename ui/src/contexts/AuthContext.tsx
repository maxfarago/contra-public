import React, { createContext, useContext, ReactNode } from "react";

interface User {
  id: string;
  tid: number;
  user: string;
  firstLogin: boolean;
}

interface AuthContextType {
  user: User;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => void;
  isLoggingOut: boolean;
}

const STUB_USER: User = {
  id: "local",
  tid: 0,
  user: "local",
  firstLogin: false,
};

const STUB_AUTH: AuthContextType = {
  user: STUB_USER,
  isAuthenticated: true,
  isLoading: false,
  logout: () => {},
  isLoggingOut: false,
};

const AuthContext = createContext<AuthContextType>(STUB_AUTH);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => (
  <AuthContext.Provider value={STUB_AUTH}>{children}</AuthContext.Provider>
);

export const useAuth = () => useContext(AuthContext);
