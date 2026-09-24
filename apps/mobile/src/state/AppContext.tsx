import type { Lesson } from "@simi/lesson-schema";
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";
import { configurePurchases } from "../services/purchases";
import { initializeNotifications } from "../services/notifications";
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
        const [lessonsResult, settingsResult, userResult] = await Promise.allSettled([
          loadLessons(), loadSettings(), ensureAuthenticatedUser(),
        ]);
        if (!mounted) return;
        if (lessonsResult.status === "fulfilled") setLessons(lessonsResult.value);
        if (settingsResult.status === "fulfilled") setSettings(settingsResult.value);
        const user = userResult.status === "fulfilled" ? userResult.value : null;
        if (userResult.status === "rejected") console.warn("Guest sign-in will retry when a lesson is requested.");
        const purchaseState = await configurePurchases(user?.id);
        if (user) void initializeNotifications(user.id).catch(() => console.warn("Notifications unavailable."));
        if (!mounted) return;
        setPro(purchaseState.isPro);
        setPurchasesConfigured(purchaseState.configured);
      } catch (error) {
        console.warn("App startup could not finish:", error);
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
