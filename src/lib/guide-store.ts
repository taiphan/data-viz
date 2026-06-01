import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface GuideState {
  /** User IDs that have already seen the guide */
  seenByUserId: string[];
  /** Whether the guide is currently open */
  isOpen: boolean;
  /** Current step in the guide */
  currentStep: number;

  markSeen: (userId: string) => void;
  hasSeen: (userId: string) => boolean;
  openGuide: () => void;
  closeGuide: () => void;
  setStep: (step: number) => void;
}

export const useGuideStore = create<GuideState>()(
  persist(
    (set, get) => ({
      seenByUserId: [],
      isOpen: false,
      currentStep: 0,

      markSeen: (userId) =>
        set((state) => ({
          seenByUserId: state.seenByUserId.includes(userId)
            ? state.seenByUserId
            : [...state.seenByUserId, userId],
        })),

      hasSeen: (userId) => get().seenByUserId.includes(userId),

      openGuide: () => set({ isOpen: true, currentStep: 0 }),
      closeGuide: () => set({ isOpen: false }),
      setStep: (step) => set({ currentStep: step }),
    }),
    {
      name: 'data-viz-guide',
      partialize: (state) => ({
        seenByUserId: state.seenByUserId,
      }),
    },
  ),
);
