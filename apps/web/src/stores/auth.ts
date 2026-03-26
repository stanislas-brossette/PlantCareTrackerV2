import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@plantcare/shared";
import { setAccessToken } from "../lib/api";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  activeGardenId: string | null;
  setAuth: (user: User, token: string) => void;
  setUser: (user: User) => void;
  setActiveGarden: (gardenId: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      activeGardenId: null,

      setAuth: (user, accessToken) => {
        setAccessToken(accessToken);
        set({ user, accessToken });
      },

      setUser: (user) => set({ user }),

      setActiveGarden: (gardenId) => set({ activeGardenId: gardenId }),

      logout: () => {
        setAccessToken(null);
        set({ user: null, accessToken: null });
      },
    }),
    {
      name: "plantcare-auth",
      onRehydrateStorage: () => (state) => {
        if (state?.accessToken) {
          setAccessToken(state.accessToken);
        }
      },
    }
  )
);
