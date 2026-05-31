"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { AP_UNITS, ALL_CHAPTERS, DAILY_TASKS } from "@/lib/apbio-data";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AppState, ScreenId, Season } from "@/lib/types";

const STORAGE_KEY = "apbiofocus-next-v1";

const defaultState: AppState = {
  darkMode: true,
  screen: "dashboard",
  selectedUnitId: 1,
  selectedChapterId: "1.1",
  checklist: {},
  completedChapters: {},
  notesByUnit: {},
  flashIndexByUnit: {},
  flashRevealByUnit: {},
  planMonthOffset: 0,
  dailyGoals: { summer: 240, fall: 120, winter: 120, spring: 120 },
  notifications: {
    desktop: true,
    inApp: true,
    sound: false,
    sessionEnd: true,
    breakEnd: true,
    streak: true,
    daily: false,
  },
  dailyLog: {},
  history: [],
  timer: {
    phase: "focus",
    running: false,
    secondsLeft: 1500,
    lastTickMs: null,
    activeUnitId: 1,
    activeChapterId: "1.1",
    sessionFocusSeconds: 0,
    pomodoroCount: 0,
    lastCompletedFocusMinutes: 25,
  },
};

const PHASE_LABELS: { key: Season; label: string }[] = [
  { key: "summer", label: "Summer (Jul-Aug): Hard units front-loaded, target 4h/day" },
  { key: "fall", label: "Fall (Sep-Nov): 2h/day, heredity/evolution focus" },
  { key: "winter", label: "Winter (Dec-Jan): 2h/day, regulation and review" },
  { key: "spring", label: "Spring (Feb-May): 2h/day, ecology and full mocks" },
];

const RESOURCE_LINKS = [
  { label: "College Board AP Biology", url: "https://apstudents.collegeboard.org/courses/ap-biology" },
  { label: "Khan Academy AP Biology", url: "https://www.khanacademy.org/science/ap-biology" },
  { label: "Bozeman Science AP Biology", url: "https://www.bozemanscience.com/ap-biology/" },
];

function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function seasonForDate(date = new Date()): Season {
  const m = date.getMonth() + 1;
  if (m >= 7 && m <= 8) return "summer";
  if (m >= 9 && m <= 11) return "fall";
  if (m === 12 || m === 1) return "winter";
  return "spring";
}

function goalForDate(state: AppState, date = new Date()) {
  return state.dailyGoals[seasonForDate(date)] ?? 120;
}

function minutesText(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatClock(seconds: number) {
  const s = Math.max(0, Math.ceil(seconds));
  const m = String(Math.floor(s / 60)).padStart(2, "0");
  const r = String(s % 60).padStart(2, "0");
  return `${m}:${r}`;
}

function phaseDurationSeconds(state: AppState) {
  if (state.timer.phase === "focus") return 1500;
  return state.timer.pomodoroCount > 0 && state.timer.pomodoroCount % 4 === 0 ? 900 : 300;
}

function parseKey(k: string) {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dateDiffDays(a: Date, b: Date) {
  const a0 = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const b0 = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.floor((a0 - b0) / 86400000);
}

function expectedChapterTarget() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const startYear = month >= 7 ? year : year - 1;
  const start = new Date(startYear, 6, 1);
  const exam = new Date(startYear + 1, 4, 10);
  const totalDays = Math.max(1, Math.ceil((exam.getTime() - start.getTime()) / 86400000));
  const elapsed = Math.max(0, Math.min(totalDays, Math.ceil((now.getTime() - start.getTime()) / 86400000)));
  const ratio = elapsed / totalDays;
  return Math.round(ratio * ALL_CHAPTERS.length);
}

function stateFromStorage(): AppState {
  if (typeof window === "undefined") return defaultState;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      ...defaultState,
      ...parsed,
      dailyGoals: { ...defaultState.dailyGoals, ...(parsed.dailyGoals ?? {}) },
      notifications: { ...defaultState.notifications, ...(parsed.notifications ?? {}) },
      timer: { ...defaultState.timer, ...(parsed.timer ?? {}), running: false, lastTickMs: null },
    };
  } catch {
    return defaultState;
  }
}

function totalFocusSeconds(state: AppState) {
  return Object.values(state.dailyLog).reduce((sum, day) => sum + (day.focusSeconds ?? 0), 0);
}

function currentStreak(state: AppState) {
  const keys = Object.keys(state.dailyLog)
    .filter((k) => (state.dailyLog[k]?.focusSeconds ?? 0) > 0)
    .sort();

  if (!keys.length) return 0;

  const latest = parseKey(keys[keys.length - 1]);
  if (dateDiffDays(new Date(), latest) > 1) return 0;

  let streak = 1;
  let cursor = latest;

  for (let i = keys.length - 2; i >= 0; i -= 1) {
    const next = parseKey(keys[i]);
    if (dateDiffDays(cursor, next) !== 1) break;
    streak += 1;
    cursor = next;
  }

  return streak;
}

function chapterProgressForUnit(state: AppState, unit: (typeof AP_UNITS)[number]) {
  const done = unit.chapters.filter((chapter) => state.completedChapters[chapter.id]).length;
  const total = unit.chapters.length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

function dayStatus(state: AppState, date: Date) {
  const key = dayKey(date);
  const mins = Math.round((state.dailyLog[key]?.focusSeconds ?? 0) / 60);
  const goal = goalForDate(state, date);
  const today = dayKey();
  if (key > today) return "future";
  if (mins <= 0) return "missed";
  if (goal > 0 && mins >= goal) return "goal";
  return "partial";
}

function monthGrid(baseDate: Date) {
  const y = baseDate.getFullYear();
  const m = baseDate.getMonth();
  const first = new Date(y, m, 1);
  const firstDow = first.getDay();
  const totalDays = new Date(y, m + 1, 0).getDate();
  const cells: (Date | null)[] = [];

  for (let i = 0; i < firstDow; i += 1) cells.push(null);
  for (let d = 1; d <= totalDays; d += 1) cells.push(new Date(y, m, d));
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return <div className={`toggle ${on ? "on" : ""}`} onClick={onClick} aria-hidden="true" />;
}

function Flashcard({
  q,
  a,
  revealed,
  onToggle,
}: {
  q: string;
  a: string;
  revealed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="chapter-item" onClick={onToggle} style={{ alignItems: "flex-start" }}>
      <div>
        <div style={{ fontWeight: 800 }}>Q: {q}</div>
        <div className="muted" style={{ marginTop: 4 }}>
          {revealed ? `A: ${a}` : "Tap to reveal answer"}
        </div>
      </div>
    </div>
  );
}

function CalendarScreen({
  state,
  setState,
}: {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
}) {
  const month = new Date();
  month.setMonth(month.getMonth() + state.planMonthOffset);
  month.setDate(1);
  const title = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const cells = monthGrid(month);

  return (
    <div className="screen">
      <div className="card">
        <div className="section-title" style={{ marginTop: 0 }}>
          Study Plan Calendar
        </div>
        {PHASE_LABELS.map((phase) => (
          <div key={phase.key} className="chip" style={{ margin: "3px 4px 3px 0", display: "inline-block" }}>
            {phase.label}
          </div>
        ))}
        <div className="row" style={{ justifyContent: "space-between", marginTop: 10 }}>
          <button className="btn" onClick={() => setState((s) => ({ ...s, planMonthOffset: s.planMonthOffset - 1 }))}>
            Previous
          </button>
          <div style={{ fontWeight: 800 }}>{title}</div>
          <button className="btn" onClick={() => setState((s) => ({ ...s, planMonthOffset: s.planMonthOffset + 1 }))}>
            Next
          </button>
        </div>
        <div className="calendar-wrap" style={{ marginTop: 10 }}>
          <div className="calendar">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day} className="cal-h">
                {day}
              </div>
            ))}
            {cells.map((date, idx) => {
              if (!date) return <div key={`empty-${idx}`} className="cal-d" />;
              const key = dayKey(date);
              const mins = Math.round((state.dailyLog[key]?.focusSeconds ?? 0) / 60);
              const status = dayStatus(state, date);
              const today = key === dayKey();
              return (
                <div key={key} className={`cal-d ${status === "future" ? "" : status} ${today ? "today" : ""}`.trim()}>
                  <div style={{ fontWeight: 800 }}>{date.getDate()}</div>
                  <div className="muted" style={{ marginTop: 3 }}>
                    {mins}m
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="footer-note">Calendar cells are based on actual focus minutes tracked from 25-minute sessions only.</div>
      </div>
    </div>
  );
}

export function FocusApp() {
  const [state, setState] = useState<AppState>(defaultState);
  const [booted, setBooted] = useState(false);
  const [toast, setToast] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const loaded = stateFromStorage();
    setState(loaded);
    setBooted(true);
  }, []);

  useEffect(() => {
    if (!booted) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, booted]);

  useEffect(() => {
    const run = async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUserEmail(session?.user.email ?? null);
    };
    void run();
  }, []);

  useEffect(() => {
    if (!state.timer.running) return;

    const id = window.setInterval(() => {
      setState((prev) => {
        if (!prev.timer.running) return prev;

        const now = Date.now();
        const last = prev.timer.lastTickMs ?? now;
        const delta = Math.max(0, (now - last) / 1000);

        const next: AppState = {
          ...prev,
          timer: {
            ...prev.timer,
            lastTickMs: now,
            secondsLeft: Math.max(0, prev.timer.secondsLeft - delta),
          },
        };

        if (prev.timer.phase === "focus") {
          next.timer.sessionFocusSeconds += delta;
          const key = dayKey(new Date(now));
          const old = next.dailyLog[key] ?? { focusSeconds: 0, sessions: 0 };
          next.dailyLog = {
            ...next.dailyLog,
            [key]: { ...old, focusSeconds: old.focusSeconds + delta },
          };
        }

        if (next.timer.secondsLeft <= 0) {
          if (next.timer.phase === "focus") {
            const mins = Math.max(1, Math.round(next.timer.sessionFocusSeconds / 60));
            const key = dayKey();
            const old = next.dailyLog[key] ?? { focusSeconds: 0, sessions: 0 };
            next.dailyLog[key] = { ...old, sessions: old.sessions + 1 };
            next.history = [
              ...next.history,
              {
                id: crypto.randomUUID(),
                date: key,
                unitId: next.timer.activeUnitId,
                chapterId: next.timer.activeChapterId,
                focusSeconds: Math.round(next.timer.sessionFocusSeconds),
              },
            ];

            next.timer = {
              ...next.timer,
              running: false,
              phase: "break",
              pomodoroCount: next.timer.pomodoroCount + 1,
              secondsLeft: (next.timer.pomodoroCount + 1) % 4 === 0 ? 900 : 300,
              sessionFocusSeconds: 0,
              lastCompletedFocusMinutes: mins,
              lastTickMs: null,
            };
            next.screen = "complete";
            if (next.notifications.sessionEnd) {
              setToast("Focus block complete. Break time.");
            }
          } else {
            next.timer = {
              ...next.timer,
              running: false,
              phase: "focus",
              secondsLeft: 1500,
              lastTickMs: null,
              sessionFocusSeconds: 0,
            };
            next.screen = "timer";
            if (next.notifications.breakEnd) setToast("Break over. Back to focus.");
          }
        }

        return next;
      });
    }, 250);

    return () => clearInterval(id);
  }, [state.timer.running]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 1800);
    return () => clearTimeout(id);
  }, [toast]);

  const chapterProgress = useMemo(() => {
    const done = ALL_CHAPTERS.filter((chapter) => state.completedChapters[chapter.id]).length;
    const total = ALL_CHAPTERS.length;
    return { done, total, pct: Math.round((done / total) * 100) };
  }, [state.completedChapters]);

  const todaySeconds = state.dailyLog[dayKey()]?.focusSeconds ?? 0;
  const todayMinutes = Math.round(todaySeconds / 60);
  const currentGoal = goalForDate(state);
  const expectedChapters = expectedChapterTarget();
  const streak = currentStreak(state);

  let statusKey: "lagging" | "onTrack" | "ahead" = "lagging";
  const ratio = currentGoal > 0 ? todayMinutes / currentGoal : 0;
  if (ratio >= 1) statusKey = "ahead";
  else if (ratio >= 0.8) statusKey = "onTrack";

  const statusTitle = statusKey === "lagging" ? "Lagging" : statusKey === "onTrack" ? "On Track" : "Ahead";
  const statusMotivation =
    statusKey === "lagging" ? "Add one more block." : statusKey === "onTrack" ? "Keep going." : "Great pace.";
  const statusCssClass = statusKey === "lagging" ? "behind" : statusKey === "onTrack" ? "on-track" : "ahead";

  const screens: { id: ScreenId; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "curriculum", label: "Curriculum" },
    { id: "calendar", label: "Plan Calendar" },
    { id: "timer", label: "Focus Timer" },
    { id: "stats", label: "Stats and History" },
    { id: "settings", label: "Settings" },
  ];

  const selectedUnit = AP_UNITS.find((unit) => unit.id === state.selectedUnitId) ?? AP_UNITS[0];
  const selectedUnitProgress = chapterProgressForUnit(state, selectedUnit);
  const activeTimerUnit = AP_UNITS.find((unit) => unit.id === state.timer.activeUnitId) ?? AP_UNITS[0];
  const timerTotal = phaseDurationSeconds(state);
  const timerPct = Math.max(0, Math.min(1, state.timer.secondsLeft / timerTotal));
  const timerCircumference = 2 * Math.PI * 120;
  const timerOffset = timerCircumference * (1 - timerPct);
  const timerModeClass = state.timer.running ? (state.timer.phase === "focus" ? "focus" : "break") : "pause";
  const timerRingClass = state.timer.phase === "break" ? "break" : timerModeClass === "pause" ? "pause" : "";
  const breakMinutes = Math.round(phaseDurationSeconds(state) / 60);

  const go = (screen: ScreenId) => setState((s) => ({ ...s, screen }));

  const syncCloud = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setToast("Set Supabase env vars first.");
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setToast("Sign in first for sync.");
      return;
    }

    const res = await fetch("/api/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ state }),
    });

    if (!res.ok) {
      setToast("Cloud sync failed.");
      return;
    }

    setToast("Synced to cloud.");
  };

  const loadCloud = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setToast("Set Supabase env vars first.");
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setToast("Sign in first for cloud load.");
      return;
    }

    const res = await fetch("/api/sync", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (!res.ok) {
      setToast("Cloud load failed.");
      return;
    }

    const body = (await res.json()) as { state: AppState | null };
    if (!body.state) {
      setToast("No cloud state found.");
      return;
    }

    setState({
      ...defaultState,
      ...body.state,
      timer: {
        ...defaultState.timer,
        ...body.state.timer,
        running: false,
        lastTickMs: null,
      },
    });
    setToast("Loaded from cloud.");
  };

  const signOut = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    setUserEmail(null);
    setToast("Signed out");
  };

  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) {
      setToast("Browser notifications unavailable.");
      return;
    }
    const result = await Notification.requestPermission();
    setToast(result === "granted" ? "Browser permission enabled." : "Notification permission not granted.");
  };

  const testNotification = () => {
    if (state.notifications.desktop && "Notification" in window && Notification.permission === "granted") {
      new Notification("APBioFocus test", { body: "Notifications are working." });
    }
    setToast("Notifications are working.");
  };

  if (!booted) {
    return <main className="app-shell" style={{ minHeight: "100vh", padding: 24 }}>Loading...</main>;
  }

  return (
    <main className={state.darkMode ? "app-shell dark" : "app-shell"} style={{ minHeight: "100vh" }}>
      <div style={{ maxWidth: 1050, margin: "0 auto", padding: "0 14px 36px" }}>
        <div className="nav">
          <div className="brand">APBioFocus</div>
          <div className="tabs">
            {screens.map((tab) => (
              <button key={tab.id} onClick={() => go(tab.id)} className={`tab ${state.screen === tab.id ? "active" : ""}`}>
                {tab.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button className="theme-btn" onClick={() => setState((s) => ({ ...s, darkMode: !s.darkMode }))}>
              {state.darkMode ? "Light Mode" : "Dark Mode"}
            </button>
            {userEmail ? (
              <>
                <span className="muted" style={{ fontSize: 12, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {userEmail}
                </span>
                <button className="theme-btn" onClick={signOut}>
                  Sign Out
                </button>
              </>
            ) : (
              <a className="theme-btn" href="/login">
                Sign In
              </a>
            )}
          </div>
        </div>

        {state.screen === "dashboard" && (
          <div className="screen">
            <div className="status-block">
              <div className={`status-main ${statusCssClass}`}>
                <div className="head">Current Status</div>
                <div className="msg">
                  {statusTitle}: {todayMinutes} / {currentGoal} min today. {statusMotivation}
                </div>
              </div>
              <div className="status-options">
                {[
                  { key: "lagging", label: "Lagging", tone: "behind" },
                  { key: "onTrack", label: "On Track", tone: "on-track" },
                  { key: "ahead", label: "Ahead", tone: "ahead" },
                ].map((option) => (
                  <div key={option.key} className={`status-option ${statusKey === option.key ? `active ${option.tone}` : ""}`.trim()}>
                    {option.label}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid-4">
              <div className="card">
                <div className="label">Today Focus</div>
                <div className="value">{minutesText(todayMinutes)}</div>
                <div className="sub">Goal {minutesText(currentGoal)}</div>
              </div>
              <div className="card">
                <div className="label">Streak</div>
                <div className="value">{streak}</div>
                <div className="sub">Consecutive study days</div>
              </div>
              <div className="card">
                <div className="label">Chapters Done</div>
                <div className="value">
                  {chapterProgress.done}/{chapterProgress.total}
                </div>
                <div className="sub">Overall {chapterProgress.pct}%</div>
              </div>
              <div className="card">
                <div className="label">Total Focus Time</div>
                <div className="value">{minutesText(Math.round(totalFocusSeconds(state) / 60))}</div>
                <div className="sub">Tracked focus minutes only</div>
              </div>
            </div>

            <div className="card" style={{ marginTop: 10 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div className="label">Curriculum Progress by Chapters</div>
                <div className="sub">Expected by now: {expectedChapters} chapters</div>
              </div>
              <div className="progress-bar" style={{ marginTop: 8 }}>
                <div className="progress-fill" style={{ width: `${chapterProgress.pct}%` }} />
              </div>
            </div>

            <div className="section-title">
              Daily Checklist ({Object.values(state.checklist).filter(Boolean).length}/{DAILY_TASKS.length})
            </div>
            <div className="chapter-list">
              {DAILY_TASKS.map((task, idx) => (
                <label key={task} className={`chapter-item ${state.checklist[idx] ? "done" : ""}`}>
                  <input
                    type="checkbox"
                    checked={!!state.checklist[idx]}
                    onChange={() => setState((s) => ({ ...s, checklist: { ...s.checklist, [idx]: !s.checklist[idx] } }))}
                  />
                  <div>{task}</div>
                </label>
              ))}
            </div>

            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn primary" onClick={() => go("timer")}>
                Start Focus Timer
              </button>
              <button className="btn" onClick={() => go("curriculum")}>
                Open Full Topic List
              </button>
            </div>
          </div>
        )}

        {state.screen === "curriculum" && (
          <div className="screen">
            <div className="section-title" style={{ marginTop: 0 }}>
              Full AP Bio Curriculum (35 Chapters)
            </div>
            {AP_UNITS.map((unit) => {
              const progress = chapterProgressForUnit(state, unit);
              return (
                <div key={unit.id} className="card unit">
                  <div className="unit-head">
                    <div>
                      <div className="unit-title">
                        Unit {unit.id}: {unit.name}
                      </div>
                      <div className="row" style={{ marginTop: 4 }}>
                        <span className="chip">{unit.season}</span>
                        <span className="chip">{unit.difficulty}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="label">Progress</div>
                      <div className="value" style={{ fontSize: 22 }}>
                        {progress.done}/{progress.total}
                      </div>
                    </div>
                  </div>
                  <div className="progress-bar" style={{ marginTop: 8 }}>
                    <div className="progress-fill" style={{ width: `${progress.pct}%` }} />
                  </div>
                  <div className="row" style={{ marginTop: 10 }}>
                    <button
                      className="btn"
                      onClick={() =>
                        setState((s) => ({
                          ...s,
                          screen: "topic",
                          selectedUnitId: unit.id,
                          selectedChapterId: unit.chapters[0]?.id ?? s.selectedChapterId,
                        }))
                      }
                    >
                      Open Unit Detail
                    </button>
                    <button
                      className="btn"
                      onClick={() =>
                        setState((s) => ({
                          ...s,
                          screen: "timer",
                          selectedUnitId: unit.id,
                          selectedChapterId: unit.chapters[0]?.id ?? s.selectedChapterId,
                          timer: {
                            ...s.timer,
                            activeUnitId: unit.id,
                            activeChapterId: unit.chapters[0]?.id ?? s.timer.activeChapterId,
                          },
                        }))
                      }
                    >
                      Study This Unit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {state.screen === "topic" && (
          <div className="screen">
            <div className="row" style={{ marginBottom: 8 }}>
              <button className="btn" onClick={() => go("curriculum")}>
                Back to Topic List
              </button>
              <button
                className="btn primary"
                onClick={() =>
                  setState((s) => ({
                    ...s,
                    screen: "timer",
                    timer: {
                      ...s.timer,
                      activeUnitId: selectedUnit.id,
                      activeChapterId: s.selectedChapterId,
                    },
                  }))
                }
              >
                Study Unit {selectedUnit.id}
              </button>
            </div>

            <div className="card">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
                <div>
                  <div className="section-title" style={{ marginTop: 0 }}>
                    Unit {selectedUnit.id}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{selectedUnit.name}</div>
                  <div className="row" style={{ marginTop: 6 }}>
                    <span className="chip">{selectedUnit.season}</span>
                    <span className="chip">{selectedUnit.difficulty}</span>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="label">Progress</div>
                  <div className="value" style={{ fontSize: 24 }}>
                    {selectedUnitProgress.done}/{selectedUnitProgress.total}
                  </div>
                </div>
              </div>

              <div className="progress-bar" style={{ marginTop: 10 }}>
                <div className="progress-fill" style={{ width: `${selectedUnitProgress.pct}%` }} />
              </div>

              <div className="section-title">Chapters in this unit</div>
              <div className="chapter-list">
                {selectedUnit.chapters.map((chapter) => (
                  <label key={chapter.id} className={`chapter-item ${state.completedChapters[chapter.id] ? "done" : ""}`}>
                    <input
                      type="checkbox"
                      checked={!!state.completedChapters[chapter.id]}
                      onChange={() =>
                        setState((s) => ({
                          ...s,
                          completedChapters: { ...s.completedChapters, [chapter.id]: !s.completedChapters[chapter.id] },
                          selectedChapterId: chapter.id,
                        }))
                      }
                    />
                    <div>
                      {chapter.id} {chapter.title}
                    </div>
                  </label>
                ))}
              </div>

              {selectedUnit.flashcards.length > 0 && (
                <>
                  <div className="section-title">Flashcard Hook</div>
                  <Flashcard
                    q={selectedUnit.flashcards[state.flashIndexByUnit[selectedUnit.id] ?? 0]?.q ?? ""}
                    a={selectedUnit.flashcards[state.flashIndexByUnit[selectedUnit.id] ?? 0]?.a ?? ""}
                    revealed={!!state.flashRevealByUnit[selectedUnit.id]}
                    onToggle={() =>
                      setState((s) => ({
                        ...s,
                        flashRevealByUnit: {
                          ...s.flashRevealByUnit,
                          [selectedUnit.id]: !s.flashRevealByUnit[selectedUnit.id],
                        },
                      }))
                    }
                  />
                  <div className="row" style={{ marginTop: 8 }}>
                    <button
                      className="btn"
                      onClick={() =>
                        setState((s) => ({
                          ...s,
                          flashRevealByUnit: { ...s.flashRevealByUnit, [selectedUnit.id]: false },
                          flashIndexByUnit: {
                            ...s.flashIndexByUnit,
                            [selectedUnit.id]:
                              s.flashIndexByUnit[selectedUnit.id] && s.flashIndexByUnit[selectedUnit.id] > 0
                                ? s.flashIndexByUnit[selectedUnit.id] - 1
                                : 0,
                          },
                        }))
                      }
                    >
                      Prev
                    </button>
                    <button
                      className="btn"
                      onClick={() =>
                        setState((s) => ({
                          ...s,
                          flashRevealByUnit: { ...s.flashRevealByUnit, [selectedUnit.id]: false },
                          flashIndexByUnit: {
                            ...s.flashIndexByUnit,
                            [selectedUnit.id]: ((s.flashIndexByUnit[selectedUnit.id] ?? 0) + 1) % selectedUnit.flashcards.length,
                          },
                        }))
                      }
                    >
                      Next
                    </button>
                  </div>
                </>
              )}

              <div className="section-title">Notes</div>
              <textarea
                value={state.notesByUnit[selectedUnit.id] ?? ""}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    notesByUnit: { ...s.notesByUnit, [selectedUnit.id]: e.target.value },
                  }))
                }
              />

              <div className="section-title">Resources</div>
              <div className="row">
                {RESOURCE_LINKS.map((resource) => (
                  <a key={resource.url} className="btn" href={resource.url} target="_blank" rel="noreferrer">
                    {resource.label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}

        {state.screen === "timer" && (
          <div className="screen">
            <div className="card timer-wrap">
              <div className="timer-phase">
                {state.timer.phase === "focus" ? `Focus Timer (${formatClock(timerTotal)})` : `Break Timer (${formatClock(timerTotal)})`}
              </div>
              <div className="ring">
                <svg viewBox="0 0 260 260" aria-hidden="true">
                  <circle className="ring-bg" cx="130" cy="130" r="120" strokeDasharray={timerCircumference} strokeDashoffset={0} />
                  <circle
                    className={`ring-fg ${timerRingClass}`.trim()}
                    cx="130"
                    cy="130"
                    r="120"
                    strokeDasharray={timerCircumference}
                    strokeDashoffset={timerOffset}
                  />
                </svg>
                <div className="ring-center">
                  <div className={`timer-display ${timerModeClass}`}>{formatClock(state.timer.secondsLeft)}</div>
                </div>
              </div>

              <div className="muted">{Math.round(state.timer.sessionFocusSeconds / 60)}m tracked in this focus block</div>
              <div style={{ marginTop: 6, fontWeight: 700 }}>
                Unit {activeTimerUnit.id}: {activeTimerUnit.name}
              </div>

              <div className="row" style={{ justifyContent: "center", marginTop: 10 }}>
                {state.timer.running ? (
                  <button
                    className="btn warn"
                    onClick={() => setState((s) => ({ ...s, timer: { ...s.timer, running: false, lastTickMs: null } }))}
                  >
                    Pause
                  </button>
                ) : (
                  <button
                    className="btn primary"
                    onClick={() => setState((s) => ({ ...s, timer: { ...s.timer, running: true, lastTickMs: Date.now() } }))}
                  >
                    {state.timer.secondsLeft < phaseDurationSeconds(state) ? "Resume" : "Start"}
                  </button>
                )}
                <button
                  className="btn"
                  onClick={() =>
                    setState((s) => ({
                      ...s,
                      timer: {
                        ...s.timer,
                        running: false,
                        lastTickMs: null,
                        secondsLeft: phaseDurationSeconds(s),
                        sessionFocusSeconds: 0,
                      },
                    }))
                  }
                >
                  Reset
                </button>
                <button
                  className="btn"
                  onClick={() =>
                    setState((s) => {
                      const nextPhase = s.timer.phase === "focus" ? "break" : "focus";
                      const nextSeconds = nextPhase === "focus" ? 1500 : s.timer.pomodoroCount > 0 && s.timer.pomodoroCount % 4 === 0 ? 900 : 300;
                      return {
                        ...s,
                        timer: {
                          ...s.timer,
                          running: false,
                          lastTickMs: null,
                          phase: nextPhase,
                          secondsLeft: nextSeconds,
                          sessionFocusSeconds: 0,
                        },
                      };
                    })
                  }
                >
                  Switch Focus/Break
                </button>
              </div>

              <div className="row" style={{ justifyContent: "center", marginTop: 10 }}>
                {AP_UNITS.map((unit) => (
                  <button
                    key={unit.id}
                    className="btn"
                    style={state.timer.activeUnitId === unit.id ? { padding: "7px 10px", background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" } : { padding: "7px 10px" }}
                    onClick={() =>
                      setState((s) => ({
                        ...s,
                        selectedUnitId: unit.id,
                        selectedChapterId: unit.chapters[0]?.id ?? s.selectedChapterId,
                        timer: {
                          ...s.timer,
                          activeUnitId: unit.id,
                          activeChapterId: unit.chapters[0]?.id ?? s.timer.activeChapterId,
                        },
                      }))
                    }
                  >
                    U{unit.id}
                  </button>
                ))}
              </div>

              <div className="footer-note">
                Only focus-phase elapsed time is added to daily totals and streaks. Break timer does not count toward study minutes.
              </div>
            </div>
          </div>
        )}

        {state.screen === "complete" && (
          <div className="screen">
            <div className="card" style={{ textAlign: "center", padding: 24 }}>
              <div className="section-title" style={{ marginTop: 0 }}>
                Session Complete
              </div>
              <div className="value" style={{ fontSize: 54 }}>
                {Math.max(1, Number(state.timer.lastCompletedFocusMinutes || 25))}
              </div>
              <div className="sub">Focus minutes complete</div>
              <div style={{ marginTop: 10, fontWeight: 800 }}>Recommended break: {breakMinutes} minutes</div>

              <div className="row" style={{ justifyContent: "center", marginTop: 14 }}>
                <button
                  className="btn primary"
                  onClick={() =>
                    setState((s) => ({
                      ...s,
                      screen: "timer",
                      timer: { ...s.timer, running: true, lastTickMs: Date.now(), phase: "break" },
                    }))
                  }
                >
                  Start Break Timer
                </button>
                <button
                  className="btn"
                  onClick={() =>
                    setState((s) => ({
                      ...s,
                      screen: "timer",
                      timer: {
                        ...s.timer,
                        phase: "focus",
                        running: false,
                        lastTickMs: null,
                        secondsLeft: 1500,
                        sessionFocusSeconds: 0,
                      },
                    }))
                  }
                >
                  Skip Break and Prepare Next Focus
                </button>
                <button className="btn" onClick={() => go("dashboard")}>
                  Back to Dashboard
                </button>
              </div>
            </div>
          </div>
        )}

        {state.screen === "calendar" && <CalendarScreen state={state} setState={setState} />}

        {state.screen === "stats" && (
          <div className="screen">
            <div className="two-col">
              <div>
                <div className="grid-4" style={{ gridTemplateColumns: "repeat(2, minmax(140px, 1fr))", marginTop: 0 }}>
                  <div className="card">
                    <div className="label">Today</div>
                    <div className="value">{minutesText(todayMinutes)}</div>
                    <div className="sub">Goal {minutesText(currentGoal)}</div>
                  </div>
                  <div className="card">
                    <div className="label">Streak</div>
                    <div className="value">{streak}</div>
                    <div className="sub">Days</div>
                  </div>
                  <div className="card">
                    <div className="label">Total Focus</div>
                    <div className="value">{minutesText(Math.round(totalFocusSeconds(state) / 60))}</div>
                    <div className="sub">All tracked days</div>
                  </div>
                  <div className="card">
                    <div className="label">Chapters Complete</div>
                    <div className="value">{chapterProgress.done}</div>
                    <div className="sub">Out of {chapterProgress.total}</div>
                  </div>
                </div>

                <div className="card" style={{ marginTop: 10 }}>
                  <div className="section-title" style={{ marginTop: 0 }}>
                    Last 7 Days
                  </div>
                  {Array.from({ length: 7 }, (_, index) => {
                    const date = new Date();
                    date.setDate(date.getDate() - (6 - index));
                    const label = date.toLocaleDateString(undefined, { weekday: "short" });
                    const mins = Math.round((state.dailyLog[dayKey(date)]?.focusSeconds ?? 0) / 60);
                    const maxDay = Math.max(
                      1,
                      ...Array.from({ length: 7 }, (_, inner) => {
                        const sample = new Date();
                        sample.setDate(sample.getDate() - (6 - inner));
                        return Math.round((state.dailyLog[dayKey(sample)]?.focusSeconds ?? 0) / 60);
                      }),
                    );
                    return (
                      <div key={label + dayKey(date)} style={{ marginBottom: 8 }}>
                        <div className="row" style={{ justifyContent: "space-between", marginBottom: 3 }}>
                          <span>{label}</span>
                          <span className="muted">{mins}m</span>
                        </div>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${Math.round((mins / maxDay) * 100)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="card">
                  <div className="section-title" style={{ marginTop: 0 }}>
                    Session History
                  </div>
                  {state.history.length === 0 ? (
                    <div className="muted">No sessions yet.</div>
                  ) : (
                    [...state.history]
                      .reverse()
                      .slice(0, 20)
                      .map((item) => {
                        const unit = AP_UNITS.find((entry) => entry.id === item.unitId);
                        return (
                          <div key={item.id} className="history-item">
                            <div>
                              <div style={{ fontWeight: 700 }}>{new Date(item.date).toLocaleDateString()}</div>
                              <div className="muted">
                                Unit {item.unitId}: {unit?.name ?? "Unknown"}
                              </div>
                            </div>
                            <div style={{ fontWeight: 800 }}>{Math.round(item.focusSeconds / 60)}m</div>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {state.screen === "settings" && (
          <div className="screen">
            <div className="two-col">
              <div className="card">
                <div className="section-title" style={{ marginTop: 0 }}>
                  Daily Goal Settings by Season
                </div>
                <div className="muted">Adjust your own study goal in minutes per day for each season.</div>
                {(["summer", "fall", "winter", "spring"] as Season[]).map((season) => (
                  <div key={season} className="setting-row">
                    <div style={{ fontWeight: 700, textTransform: "capitalize" }}>{season}</div>
                    <input
                      type="number"
                      min={0}
                      max={720}
                      value={state.dailyGoals[season]}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          dailyGoals: {
                            ...s.dailyGoals,
                            [season]: Math.max(0, Math.min(720, Number(e.target.value) || 0)),
                          },
                        }))
                      }
                    />
                  </div>
                ))}

                <div className="section-title">Current Season Target</div>
                <div style={{ fontSize: 22, fontWeight: 800, textTransform: "capitalize" }}>
                  {capitalize(seasonForDate())} - {minutesText(goalForDate(state))}/day
                </div>

                <div className="footer-note">Summer defaults to 240 min/day (4h). Fall through spring defaults to 120 min/day (2h).</div>
              </div>

              <div className="card">
                <div className="section-title" style={{ marginTop: 0 }}>
                  Notifications
                </div>
                {(
                  [
                    ["sessionEnd", "Session complete"],
                    ["breakEnd", "Break complete"],
                    ["daily", "Daily reminder"],
                    ["streak", "Streak milestones"],
                    ["desktop", "Desktop notifications"],
                    ["sound", "Sound alert"],
                    ["inApp", "In-app banners"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="setting-row">
                    <div>{label}</div>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <Toggle
                        on={state.notifications[key]}
                        onClick={() =>
                          setState((s) => ({
                            ...s,
                            notifications: { ...s.notifications, [key]: !s.notifications[key] },
                          }))
                        }
                      />
                    </div>
                  </div>
                ))}

                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn" onClick={() => void requestNotificationPermission()}>
                    Enable Browser Permission
                  </button>
                  <button className="btn" onClick={testNotification}>
                    Test Notification
                  </button>
                  <button className="btn" onClick={() => void syncCloud()}>
                    Sync to Cloud
                  </button>
                  <button className="btn" onClick={() => void loadCloud()}>
                    Load Cloud
                  </button>
                </div>

                <div className="section-title">Cycle Dates</div>
                <div className="muted">Study start: July 1 each cycle</div>
                <div className="muted">Target exam week: first week of May</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 16,
            left: "50%",
            transform: "translateX(-50%)",
            borderRadius: 999,
            padding: "8px 16px",
            fontSize: 12,
            fontWeight: 700,
            color: "#fff",
            background: "var(--ink)",
          }}
        >
          {toast}
        </div>
      )}
    </main>
  );
}
