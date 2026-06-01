import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type CoachmarkId =
  | 'field-panel-drag'
  | 'encoding-shelf'
  | 'chart-canvas'
  | 'filter-panel'
  | 'sheet-tabs';

interface CoachmarkState {
  /** Coachmark IDs the user has dismissed */
  dismissed: CoachmarkId[];

  isDismissed: (id: CoachmarkId) => boolean;
  dismiss: (id: CoachmarkId) => void;
  dismissAll: () => void;
  reset: () => void;
}

export const useCoachmarkStore = create<CoachmarkState>()(
  persist(
    (set, get) => ({
      dismissed: [],

      isDismissed: (id) => get().dismissed.includes(id),

      dismiss: (id) =>
        set((state) => ({
          dismissed: state.dismissed.includes(id)
            ? state.dismissed
            : [...state.dismissed, id],
        })),

      dismissAll: () =>
        set({
          dismissed: [
            'field-panel-drag',
            'encoding-shelf',
            'chart-canvas',
            'filter-panel',
            'sheet-tabs',
          ],
        }),

      reset: () => set({ dismissed: [] }),
    }),
    {
      name: 'data-viz-coachmarks',
    },
  ),
);
