import type { Lesson } from "@simi/lesson-schema";
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";
import { configurePurchases } from "../services/purchases";
import { ensureAuthenticatedUser } from "../services/supabase";
import { loadLessons, loadSettings, type AppSettings, removeLesson, saveLesson, saveSettings as persistSettings } from "../services/storage";

type AppState = {
  lessons: Lesson[];
  activeLesson: Lesson | null;
  settings: AppSettings;
  isPro: boolean;
  purchasesConfigured: boolean;
  ready: boolean;
  setActiveLesson: (lesson: Lesson | null) => void;
  addLesson: (lesson: Lesson) => Promise<void>;
  deleteLesson: (lessonId: string) => Promise<void>;
  updateSettings: (settings: AppSettings) => Promise<void>;
  setPro: (value: boolean) => void;
};

const Context = createContext<AppState | null>(null);

export function AppProvider({ children }: PropsWithChildren) {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [settings, setSettings] = useState<AppSettings>({ speechRate: 1, captions: true, reducedMotion: false });
  const [isPro, setPro] = useState(false);
  const [purchasesConfigured, setPurchasesConfigured] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const [storedLessons, storedSettings, user] = await Promise.all([loadLessons(), loadSettings(), ensureAuthenticatedUser()]);
        const purchaseState = await configurePurchases(user?.id);
        if (!mounted) return;
        setLessons(storedLessons);
        setSettings(storedSettings);
        setPro(purchaseState.isPro);
        setPurchasesConfigured(purchaseState.configured);
      } finally {
        if (mounted) setReady(true);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const value = useMemo<AppState>(() => ({
    lessons, activeLesson, settings, isPro, purchasesConfigured, ready, setActiveLesson, setPro,
    addLesson: async (lesson) => setLessons(await saveLesson(lesson)),
    deleteLesson: async (lessonId) => setLessons(await removeLesson(lessonId)),
    updateSettings: async (next) => {
      setSettings(next);
      await persistSettings(next);
    },
  }), [lessons, activeLesson, settings, isPro, purchasesConfigured, ready]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useApp(): AppState {
  const value = useContext(Context);
  if (!value) throw new Error("useApp must be called inside AppProvider");
  return value;
}
