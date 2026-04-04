"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiFetch, getStoredToken, setStoredToken } from "./api";

export type User = { id: string; email: string; createdAt: string };

type AuthState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; user: User };

type AuthContextValue = {
  state: AuthState;
  login: (token: string, user: User) => void;
  logout: () => void;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const refresh = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setState({ status: "unauthenticated" });
      return;
    }
    try {
      const r = await apiFetch<{ user: User }>("/auth/me", {}, token);
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) {
          setStoredToken(null);
        }
        setState({ status: "unauthenticated" });
        return;
      }
      setState({ status: "authenticated", user: r.data.user });
    } catch (error) {
      // Fetch threw an error (e.g., network down, CORS issue, bad gateway)
      // Transition to unauthenticated state so the app works, but don't delete the token.
      setState({ status: "unauthenticated" });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback((token: string, user: User) => {
    setStoredToken(token);
    setState({ status: "authenticated", user });
  }, []);

  const logout = useCallback(() => {
    setStoredToken(null);
    setState({ status: "unauthenticated" });
  }, []);

  const value = useMemo(
    () => ({
      state,
      login,
      logout,
      refresh,
    }),
    [state, login, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
