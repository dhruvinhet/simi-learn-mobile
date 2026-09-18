import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Lesson } from "@simi/lesson-schema";

const LESSONS_KEY = "simi.lessons.v1";
const SETTINGS_KEY = "simi.settings.v1";
const USAGE_KEY = "simi.usage.v1";
const MAX_LESSONS = 30;

export type AppSettings = { speechRate: number; captions: boolean; reducedMotion: boolean };
const defaultSettings: AppSettings = { speechRate: 1, captions: true, reducedMotion: false };

export async function loadLessons(): Promise<Lesson[]> {
  const raw = await AsyncStorage.getItem(LESSONS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw) as Lesson[]; } catch { return []; }
}

export async function saveLesson(lesson: Lesson): Promise<Lesson[]> {
  const current = await loadLessons();
  const next = [lesson, ...current.filter((item) => item.lessonId !== lesson.lessonId)].slice(0, MAX_LESSONS);
  await AsyncStorage.setItem(LESSONS_KEY, JSON.stringify(next));
  return next;
}

export async function removeLesson(lessonId: string): Promise<Lesson[]> {
  const next = (await loadLessons()).filter((item) => item.lessonId !== lessonId);
  await AsyncStorage.setItem(LESSONS_KEY, JSON.stringify(next));
  return next;
}

export async function loadSettings(): Promise<AppSettings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!raw) return defaultSettings;
  try { return { ...defaultSettings, ...(JSON.parse(raw) as Partial<AppSettings>) }; } catch { return defaultSettings; }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function incrementGuestUsage(): Promise<number> {
  const current = Number(await AsyncStorage.getItem(USAGE_KEY) ?? 0);
  const next = current + 1;
  await AsyncStorage.setItem(USAGE_KEY, String(next));
  return next;
}

export async function getGuestUsage(): Promise<number> {
  return Number(await AsyncStorage.getItem(USAGE_KEY) ?? 0);
}

