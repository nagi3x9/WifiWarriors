import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const useAuthStore = create(
  persist(
    (set) => ({
      playerId: `player_${crypto.randomUUID().split('-')[0]}`,
      setPlayerId: (id) => set({ playerId: id }),
    }),
    {
      name: 'wifi-warriors-auth', // name of the item in the storage (must be unique)
      storage: createJSONStorage(() => sessionStorage), // use sessionStorage instead of localStorage
    }
  )
);

export default useAuthStore;
