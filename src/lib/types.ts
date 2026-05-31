export type Season = "summer" | "fall" | "winter" | "spring";

export type ScreenId =
  | "dashboard"
  | "curriculum"
  | "calendar"
  | "timer"
  | "complete"
  | "stats"
  | "topic"
  | "settings";

export type Chapter = {
  id: string;
  title: string;
};

export type Unit = {
  id: number;
  name: string;
  difficulty: "hard" | "medium" | "easy";
  season: Season;
  description: string;
  chapters: Chapter[];
  resources: { label: string; url: string }[];
  flashcards: { q: string; a: string }[];
};

export type StudySessionRow = {
  id: string;
  user_id: string;
  unit_id: number;
  chapter_id: string | null;
  started_at: string;
  ended_at: string;
  focus_seconds: number;
  session_type: "focus" | "break";
};

export type AppState = {
  darkMode: boolean;
  screen: ScreenId;
  selectedUnitId: number;
  selectedChapterId: string;
  checklist: Record<number, boolean>;
  completedChapters: Record<string, boolean>;
  notesByUnit: Record<number, string>;
  flashIndexByUnit: Record<number, number>;
  flashRevealByUnit: Record<number, boolean>;
  planMonthOffset: number;
  dailyGoals: Record<Season, number>;
  notifications: {
    desktop: boolean;
    inApp: boolean;
    sound: boolean;
    sessionEnd: boolean;
    breakEnd: boolean;
    streak: boolean;
    daily: boolean;
  };
  dailyLog: Record<string, { focusSeconds: number; sessions: number }>;
  history: {
    id: string;
    date: string;
    unitId: number;
    chapterId: string;
    focusSeconds: number;
  }[];
  timer: {
    phase: "focus" | "break";
    running: boolean;
    secondsLeft: number;
    lastTickMs: number | null;
    activeUnitId: number;
    activeChapterId: string;
    sessionFocusSeconds: number;
    pomodoroCount: number;
    lastCompletedFocusMinutes: number;
  };
};
