import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useWarriorStore = create(
  persist(
    (set, get) => ({
      warriors: [],
      
      saveWarrior: (warrior) => {
        const currentWarriors = get().warriors;
        if (currentWarriors.length >= 3) {
          return { success: false, message: 'ロースターがいっぱいです！最大3体まで保存できます。' };
        }
        
        // Add a unique ID and capture timestamp
        const newWarrior = {
          ...warrior,
          id: crypto.randomUUID(),
          capturedAt: new Date().toISOString()
        };

        set({ warriors: [...currentWarriors, newWarrior] });
        return { success: true, message: '新しい戦士を記録しました！' };
      },
      
      deleteWarrior: (id) => {
        set((state) => ({
          warriors: state.warriors.filter(w => w.id !== id)
        }));
      },
      
      clearRoster: () => set({ warriors: [] })
    }),
    {
      name: 'wifi-warriors-storage', // key in localStorage
    }
  )
);

export default useWarriorStore;
