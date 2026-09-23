import { create } from "zustand";
import type { User } from "@/lib/types";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: (silent?: boolean) => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: true,
  async login(email, password) {
    set({ loading: true });
    try {
      const res = await apiRequest("POST", "/api/auth/login", { email, password });
      const data = (await res.json()) as User;
      set({ user: data, loading: false });
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },
  async logout() {
    await apiRequest("POST", "/api/auth/logout");
    queryClient.clear();
    set({ user: null });
  },
  async fetchMe(silent = false) {
    if (!silent) {
      set({ loading: true });
    }
    try {
      const res = await apiRequest("GET", "/api/auth/me");
      const data = (await res.json()) as User | null;
      set({ user: data ?? null, ...(silent ? {} : { loading: false }) });
    } catch {
      set({ user: null, ...(silent ? {} : { loading: false }) });
    }
  },
}));
