import React, {
  createContext,
  useContext,
  ReactNode,
  useEffect,
  useState,
} from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "../lib/api";
import Loader from "../components/ui/Loader";

// Define the shape of the user object we expect from the /auth/me endpoint
interface User {
  id: string;
  tid: number;
  user: string;
  firstLogin: boolean;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => void;
  isLoggingOut: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Fetches the current user from the /auth/me endpoint
const fetchUser = async (): Promise<User> => {
  const { data } = await api.get("/auth/me");
  return data;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Use react-query to fetch and cache the user's session
  const { data: user, isLoading, isError } = useQuery<User>({
    queryKey: ["user"],
    queryFn: fetchUser,
    retry: false, // Don't retry on 401, it just means the user is not logged in
    refetchOnWindowFocus: false, // Optional: prevent refetching on window focus
    enabled: !isLoggingOut, // Don't fetch if we're logging out
  });

  // Effect to enforce the welcome/onboarding flow for new users
  useEffect(() => {
    if (user?.firstLogin && location.pathname !== '/welcome') {
      navigate('/welcome', { replace: true });
    }
  }, [user, navigate, location.pathname]);

  const logoutMutation = useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSuccess: () => {
      // Set logging out state to prevent any refetches
      setIsLoggingOut(true);
      // Remove the user query completely
      queryClient.removeQueries({ queryKey: ["user"] });
      // Redirect to the main site
      window.location.href = "https://contra.trade";
    },
  });

  const isAuthenticated = !!user && !isError && !isLoggingOut;

  // If the session is still loading, we can show a full-page loader
  if (isLoading) {
    return <Loader text="loading session..." />;
  }

  return (
    <AuthContext.Provider
      value={{
        user: user || null,
        isAuthenticated,
        isLoading,
        logout: logoutMutation.mutate,
        isLoggingOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
