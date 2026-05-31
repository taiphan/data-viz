import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================================
// DEMO USERS — Client-side auth (no backend required)
// ============================================================

export interface DemoUser {
  id: string;
  username: string;
  password: string;
  displayName: string;
  role: 'admin' | 'analyst' | 'viewer';
  avatar: string;
  description: string;
}

export const DEMO_USERS: DemoUser[] = [
  {
    id: 'usr_admin_001',
    username: 'admin',
    password: 'admin123',
    displayName: 'Alex Admin',
    role: 'admin',
    avatar: '👑',
    description: 'Full access — manage users, connectors, and system settings',
  },
  {
    id: 'usr_analyst_001',
    username: 'analyst',
    password: 'analyst123',
    displayName: 'Sarah Analyst',
    role: 'analyst',
    avatar: '📊',
    description: 'Create dashboards, connect data sources, build charts',
  },
  {
    id: 'usr_analyst_002',
    username: 'david',
    password: 'david123',
    displayName: 'David Chen',
    role: 'analyst',
    avatar: '🔬',
    description: 'Data exploration, ETL flows, and advanced analytics',
  },
  {
    id: 'usr_viewer_001',
    username: 'viewer',
    password: 'viewer123',
    displayName: 'Maya Viewer',
    role: 'viewer',
    avatar: '👁️',
    description: 'View dashboards and exported reports (read-only)',
  },
  {
    id: 'usr_demo_001',
    username: 'demo',
    password: 'demo1234',
    displayName: 'Demo User',
    role: 'analyst',
    avatar: '🚀',
    description: 'Try all features — charts, filters, AI insights, and more',
  },
];

// ============================================================
// AUTH STORE
// ============================================================

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: string;
  avatar: string;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;

  login: (username: string, password: string) => Promise<void>;
  loginAsDemo: (demoUser: DemoUser) => void;
  logout: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoading: false,
      error: null,

      login: async (username, password) => {
        set({ isLoading: true, error: null });

        // Simulate network delay for realistic UX
        await new Promise((resolve) => setTimeout(resolve, 400));

        const normalized = username.toLowerCase().trim();
        const found = DEMO_USERS.find(
          (u) => u.username === normalized && u.password === password,
        );

        if (!found) {
          set({
            isLoading: false,
            error: 'Invalid username or password.',
          });
          return;
        }

        set({
          user: {
            id: found.id,
            username: found.username,
            displayName: found.displayName,
            role: found.role,
            avatar: found.avatar,
          },
          isLoading: false,
          error: null,
        });
      },

      loginAsDemo: (demoUser) => {
        set({
          user: {
            id: demoUser.id,
            username: demoUser.username,
            displayName: demoUser.displayName,
            role: demoUser.role,
            avatar: demoUser.avatar,
          },
          isLoading: false,
          error: null,
        });
      },

      logout: () => {
        set({ user: null, error: null });
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'data-viz-auth',
      partialize: (state) => ({
        user: state.user,
      }),
    },
  ),
);
