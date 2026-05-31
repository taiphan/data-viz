import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  error: string | null;

  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, displayName?: string) => Promise<void>;
  logout: () => void;
  refreshSession: () => Promise<boolean>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoading: false,
      error: null,

      login: async (username, password) => {
        set({ isLoading: true, error: null });

        try {
          const res = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
          });

          const data = await res.json();

          if (!res.ok) {
            set({
              isLoading: false,
              error: data.error?.message || 'Login failed',
            });
            return;
          }

          set({
            user: data.user,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            isLoading: false,
            error: null,
          });
        } catch {
          set({ isLoading: false, error: 'Network error. Is the server running?' });
        }
      },

      register: async (username, password, displayName) => {
        set({ isLoading: true, error: null });

        try {
          const res = await fetch(`${API_BASE}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, displayName }),
          });

          const data = await res.json();

          if (!res.ok) {
            const message = data.error?.details
              ? Object.values(data.error.details).flat().join('. ')
              : data.error?.message || 'Registration failed';
            set({ isLoading: false, error: message });
            return;
          }

          set({
            user: data.user,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            isLoading: false,
            error: null,
          });
        } catch {
          set({ isLoading: false, error: 'Network error. Is the server running?' });
        }
      },

      logout: () => {
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          error: null,
        });
      },

      refreshSession: async () => {
        const { refreshToken } = get();
        if (!refreshToken) return false;

        try {
          const res = await fetch(`${API_BASE}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });

          if (!res.ok) {
            set({ user: null, accessToken: null, refreshToken: null });
            return false;
          }

          const data = await res.json();
          set({
            user: data.user,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
          });
          return true;
        } catch {
          return false;
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'data-viz-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    },
  ),
);
