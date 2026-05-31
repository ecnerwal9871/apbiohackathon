"use client";

import { useEffect, useMemo, useState } from "react";
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
    daily: false
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
    lastCompletedFocusMinutes: 25
  }
};

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
      timer: { ...defaultState.timer, ...(parsed.timer ?? {}), running: false, lastTickMs: null }
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
        data: { session }
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
            secondsLeft: Math.max(0, prev.timer.secondsLeft - delta)
          }
        };

        if (prev.timer.phase === "focus") {
          next.timer.sessionFocusSeconds += delta;
          const key = dayKey(new Date(now));
          const old = next.dailyLog[key] ?? { focusSeconds: 0, sessions: 0 };
          next.dailyLog = {
            ...next.dailyLog,
            [key]: { ...old, focusSeconds: old.focusSeconds + delta }
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
                focusSeconds: Math.round(next.timer.sessionFocusSeconds)
              }
            ];

            next.timer = {
              ...next.timer,
              running: false,
              phase: "break",
              pomodoroCount: next.timer.pomodoroCount + 1,
              secondsLeft: (next.timer.pomodoroCount + 1) % 4 === 0 ? 900 : 300,
              sessionFocusSeconds: 0,
              lastCompletedFocusMinutes: mins,
              lastTickMs: null
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
              sessionFocusSeconds: 0
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
    const done = ALL_CHAPTERS.filter((c) => state.completedChapters[c.id]).length;
    const total = ALL_CHAPTERS.length;
    return { done, total, pct: Math.round((done / total) * 100) };
  }, [state.completedChapters]);

  const todaySeconds = state.dailyLog[dayKey()]?.focusSeconds ?? 0;
  const todayMinutes = Math.round(todaySeconds / 60);
  const currentGoal = goalForDate(state);
  const streak = currentStreak(state);

  let statusKey: "lagging" | "onTrack" | "ahead" = "lagging";
  const ratio = currentGoal > 0 ? todayMinutes / currentGoal : 0;
  if (ratio >= 1) statusKey = "ahead";
  else if (ratio >= 0.8) statusKey = "onTrack";

  const screens: { id: ScreenId; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "curriculum", label: "Curriculum" },
    { id: "calendar", label: "Plan" },
    { id: "timer", label: "Focus" },
    { id: "stats", label: "Stats" },
    { id: "settings", label: "Settings" }
  ];

  const selectedUnit = AP_UNITS.find((u) => u.id === state.selectedUnitId) ?? AP_UNITS[0];
  const statusTone =
    statusKey === "lagging"
      ? "status-lagging"
      : statusKey === "onTrack"
        ? "status-on-track"
        : "status-ahead";
  const timerTotal = phaseDurationSeconds(state);
  const timerPct = Math.max(0, Math.min(1, state.timer.secondsLeft / timerTotal));
  const timerCircumference = 2 * Math.PI * 120;
  const timerOffset = timerCircumference * (1 - timerPct);
  const timerModeClass = state.timer.running ? (state.timer.phase === "focus" ? "focus" : "break") : "pause";
  const timerRingClass = state.timer.phase === "break" ? "break" : timerModeClass === "pause" ? "pause" : "";

  const go = (screen: ScreenId) => setState((s) => ({ ...s, screen }));

  const syncCloud = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setToast("Set Supabase env vars first.");
      return;
    }

    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session) {
      setToast("Sign in first for sync.");
      return;
    }

    const res = await fetch("/api/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ state })
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
      data: { session }
    } = await supabase.auth.getSession();

    if (!session) {
      setToast("Sign in first for cloud load.");
      return;
    }

    const res = await fetch("/api/sync", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
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
        lastTickMs: null
      }
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

  if (!booted) {
    return <main className="mx-auto max-w-4xl p-6">Loading...</main>;
  }

  return (
    <main className={state.darkMode ? "app-shell dark min-h-screen" : "app-shell min-h-screen"}>
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-4">
        <header
          className="app-nav sticky top-2 z-10 mb-4 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border p-3"
          style={{ borderColor: "var(--line)" }}
        >
          <div className="app-brand">APBioFocus</div>
          <div className="min-w-0">
            <div className="app-tabs [&::-webkit-scrollbar]:hidden">
              {screens.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => go(tab.id)}
                  className={`app-tab rounded-full px-3 py-1 text-xs font-bold ${state.screen === tab.id ? "app-tab-active" : ""}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-self-end gap-2">
            <button
              onClick={() => setState((s) => ({ ...s, darkMode: !s.darkMode }))}
              className="rounded-full border px-3 py-1 text-xs font-bold"
              style={{ borderColor: "var(--line)", background: "var(--card)" }}
            >
              {state.darkMode ? "Light" : "Dark"}
            </button>
            {userEmail ? (
              <>
                <span className="max-w-32 truncate text-xs" style={{ color: "var(--muted)" }}>
                  {userEmail}
                </span>
                <button
                  onClick={signOut}
                  className="rounded-full border px-3 py-1 text-xs font-bold"
                  style={{ borderColor: "var(--line)", background: "var(--card)" }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <a
                href="/login"
                className="rounded-full border px-3 py-1 text-xs font-bold"
                style={{ borderColor: "var(--line)", background: "var(--card)" }}
              >
                Sign in
              </a>
            )}
          </div>
        </header>

        {state.screen === "dashboard" && (
          <section className="space-y-3">
            <div className={`status-main ${statusTone} rounded-xl border p-4`}>
              <div className="text-xs font-extrabold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                Current Status
              </div>
              <div className="mt-2 text-2xl font-black">
                {statusKey === "lagging" && "Lagging"}
                {statusKey === "onTrack" && "On Track"}
                {statusKey === "ahead" && "Ahead"}
              </div>
              <div className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                {todayMinutes}/{currentGoal} minutes today
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {[
                  { key: "lagging", label: "Lagging", tone: "status-lagging-active" },
                  { key: "onTrack", label: "On Track", tone: "status-on-track-active" },
                  { key: "ahead", label: "Ahead", tone: "status-ahead-active" }
                ].map((option) => (
                  <div
                    key={option.key}
                    className={`status-option rounded-lg border p-2 text-center text-sm font-black ${statusKey === option.key ? option.tone : ""}`}
                    style={{ borderColor: statusKey === option.key ? undefined : "var(--line)", color: statusKey === option.key ? undefined : "var(--muted)" }}
                  >
                    {option.label}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Today Focus" value={minutesText(todayMinutes)} sub={`Goal ${minutesText(currentGoal)}`} />
              <StatCard label="Streak" value={`${streak}`} sub="Consecutive days" />
              <StatCard label="Chapter Progress" value={`${chapterProgress.done}/${chapterProgress.total}`} sub={`${chapterProgress.pct}% complete`} />
              <StatCard
                label="Total Focus"
                value={minutesText(Math.round(totalFocusSeconds(state) / 60))}
                sub="Break time excluded"
              />
            </div>

            <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
              <div className="flex items-center justify-between">
                <div className="text-xs font-extrabold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                  Daily Checklist
                </div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  {Object.values(state.checklist).filter(Boolean).length}/{DAILY_TASKS.length}
                </div>
              </div>
              <div className="mt-2 space-y-2">
                {DAILY_TASKS.map((task, idx) => (
                  <label key={task} className="flex cursor-pointer items-center gap-2 rounded-lg border p-2" style={{ borderColor: "var(--line)" }}>
                    <input
                      type="checkbox"
                      checked={!!state.checklist[idx]}
                      onChange={() =>
                        setState((s) => ({ ...s, checklist: { ...s.checklist, [idx]: !s.checklist[idx] } }))
                      }
                    />
                    <span>{task}</span>
                  </label>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => go("timer")} className="rounded-lg border px-4 py-2 text-sm font-bold" style={{ borderColor: "var(--line)", background: "var(--accent)", color: "#fff" }}>
                  Start Focus
                </button>
                <button onClick={syncCloud} className="rounded-lg border px-4 py-2 text-sm font-bold" style={{ borderColor: "var(--line)" }}>
                  Sync Cloud
                </button>
                <button onClick={loadCloud} className="rounded-lg border px-4 py-2 text-sm font-bold" style={{ borderColor: "var(--line)" }}>
                  Load Cloud
                </button>
              </div>
            </div>
          </section>
        )}

        {state.screen === "curriculum" && (
          <section className="space-y-3">
            {AP_UNITS.map((unit) => {
              const done = unit.chapters.filter((c) => state.completedChapters[c.id]).length;
              const pct = Math.round((done / unit.chapters.length) * 100);
              return (
                <div key={unit.id} className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-black">Unit {unit.id}: {unit.name}</div>
                      <div className="text-xs" style={{ color: "var(--muted)" }}>
                        {unit.difficulty} | {unit.season}
                      </div>
                    </div>
                    <div className="text-sm font-bold">{done}/{unit.chapters.length} chapters</div>
                  </div>
                  <div className="mt-2 h-2 rounded-full" style={{ background: "var(--line)" }}>
                    <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: "var(--accent)" }} />
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() =>
                        setState((s) => ({
                          ...s,
                          screen: "topic",
                          selectedUnitId: unit.id,
                          selectedChapterId: unit.chapters[0].id
                        }))
                      }
                      className="rounded-lg border px-3 py-1 text-xs font-bold"
                      style={{ borderColor: "var(--line)" }}
                    >
                      Open Unit
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {state.screen === "topic" && (
          <section className="space-y-3">
            <button onClick={() => go("curriculum")} className="text-sm underline" style={{ color: "var(--muted)" }}>
              Back to curriculum
            </button>
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-extrabold uppercase" style={{ color: "var(--muted)" }}>
                    Unit {selectedUnit.id}
                  </div>
                  <h3 className="text-xl font-black">{selectedUnit.name}</h3>
                </div>
                <button
                  onClick={() =>
                    setState((s) => ({
                      ...s,
                      timer: {
                        ...s.timer,
                        activeUnitId: selectedUnit.id,
                        activeChapterId: s.selectedChapterId
                      },
                      screen: "timer"
                    }))
                  }
                  className="rounded-lg border px-3 py-1 text-xs font-bold"
                  style={{ borderColor: "var(--line)", background: "var(--accent)", color: "#fff" }}
                >
                  Study This Unit
                </button>
              </div>

              <div className="mt-3 space-y-2">
                {selectedUnit.chapters.map((ch) => (
                  <label key={ch.id} className="flex items-center gap-2 rounded-lg border p-2" style={{ borderColor: "var(--line)" }}>
                    <input
                      type="checkbox"
                      checked={!!state.completedChapters[ch.id]}
                      onChange={() =>
                        setState((s) => ({
                          ...s,
                          completedChapters: { ...s.completedChapters, [ch.id]: !s.completedChapters[ch.id] },
                          selectedChapterId: ch.id
                        }))
                      }
                    />
                    <span className="text-sm">{ch.id} {ch.title}</span>
                  </label>
                ))}
              </div>

              <div className="mt-4">
                <div className="text-xs font-extrabold uppercase" style={{ color: "var(--muted)" }}>
                  Flashcard Hook
                </div>
                {selectedUnit.flashcards.length > 0 && (
                  <Flashcard
                    unitId={selectedUnit.id}
                    q={selectedUnit.flashcards[state.flashIndexByUnit[selectedUnit.id] ?? 0]?.q ?? ""}
                    a={selectedUnit.flashcards[state.flashIndexByUnit[selectedUnit.id] ?? 0]?.a ?? ""}
                    revealed={!!state.flashRevealByUnit[selectedUnit.id]}
                    onToggle={() =>
                      setState((s) => ({
                        ...s,
                        flashRevealByUnit: {
                          ...s.flashRevealByUnit,
                          [selectedUnit.id]: !s.flashRevealByUnit[selectedUnit.id]
                        }
                      }))
                    }
                    onNext={() =>
                      setState((s) => ({
                        ...s,
                        flashRevealByUnit: { ...s.flashRevealByUnit, [selectedUnit.id]: false },
                        flashIndexByUnit: {
                          ...s.flashIndexByUnit,
                          [selectedUnit.id]:
                            ((s.flashIndexByUnit[selectedUnit.id] ?? 0) + 1) % selectedUnit.flashcards.length
                        }
                      }))
                    }
                  />
                )}
              </div>

              <div className="mt-4">
                <div className="text-xs font-extrabold uppercase" style={{ color: "var(--muted)" }}>
                  Notes
                </div>
                <textarea
                  className="mt-2 w-full rounded-lg border p-2 text-sm"
                  style={{ borderColor: "var(--line)", background: "transparent" }}
                  value={state.notesByUnit[selectedUnit.id] ?? ""}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      notesByUnit: { ...s.notesByUnit, [selectedUnit.id]: e.target.value }
                    }))
                  }
                />
              </div>
            </div>
          </section>
        )}

        {state.screen === "timer" && (
          <section className="rounded-xl border p-5 text-center" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
            <div className="timer-phase">{state.timer.phase === "focus" ? "Focus Block" : "Break Block"}</div>
            <div className="timer-ring">
              <svg viewBox="0 0 260 260" aria-hidden="true">
                <circle className="timer-ring-bg" cx="130" cy="130" r="120" strokeDasharray={timerCircumference} strokeDashoffset={0} />
                <circle
                  className={`timer-ring-fg ${timerRingClass}`.trim()}
                  cx="130"
                  cy="130"
                  r="120"
                  strokeDasharray={timerCircumference}
                  strokeDashoffset={timerOffset}
                />
              </svg>
              <div className="timer-ring-center">
                <div className={`timer-display ${timerModeClass}`}>{formatClock(state.timer.secondsLeft)}</div>
              </div>
            </div>
            <div className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
              {state.timer.phase === "focus" ? "25-minute pomodoro" : "Break does not count toward study time"}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {state.timer.running ? (
                <button
                  onClick={() => setState((s) => ({ ...s, timer: { ...s.timer, running: false, lastTickMs: null } }))}
                  className="rounded-lg border px-4 py-2 text-sm font-bold"
                  style={{ borderColor: "var(--line)", background: "var(--warn)", color: "#111" }}
                >
                  Pause
                </button>
              ) : (
                <button
                  onClick={() =>
                    setState((s) => ({ ...s, timer: { ...s.timer, running: true, lastTickMs: Date.now() } }))
                  }
                  className="rounded-lg border px-4 py-2 text-sm font-bold"
                  style={{ borderColor: "var(--line)", background: "var(--accent)", color: "#fff" }}
                >
                  {state.timer.secondsLeft < phaseDurationSeconds(state) ? "Resume" : "Start"}
                </button>
              )}
              <button
                onClick={() =>
                  setState((s) => ({
                    ...s,
                    timer: {
                      ...s.timer,
                      running: false,
                      lastTickMs: null,
                      secondsLeft: phaseDurationSeconds(s),
                      sessionFocusSeconds: 0
                    }
                  }))
                }
                className="rounded-lg border px-4 py-2 text-sm font-bold"
                style={{ borderColor: "var(--line)" }}
              >
                Reset
              </button>
              <button
                onClick={() =>
                  setState((s) => ({
                    ...s,
                    timer: {
                      ...s.timer,
                      running: false,
                      lastTickMs: null,
                      phase: s.timer.phase === "focus" ? "break" : "focus",
                      secondsLeft: s.timer.phase === "focus" ? 300 : 1500,
                      sessionFocusSeconds: 0
                    }
                  }))
                }
                className="rounded-lg border px-4 py-2 text-sm font-bold"
                style={{ borderColor: "var(--line)" }}
              >
                Switch Focus/Break
              </button>
            </div>
            <div className="mt-4 text-sm" style={{ color: "var(--muted)" }}>
              Session focus tracked: {Math.round(state.timer.sessionFocusSeconds / 60)}m
            </div>
          </section>
        )}

        {state.screen === "complete" && (
          <section className="rounded-xl border p-6 text-center" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
            <h2 className="text-4xl font-black">Session Complete</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
              Focus earned: {state.timer.lastCompletedFocusMinutes} minutes
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                onClick={() =>
                  setState((s) => ({
                    ...s,
                    screen: "timer",
                    timer: { ...s.timer, running: true, lastTickMs: Date.now(), phase: "break" }
                  }))
                }
                className="rounded-lg border px-4 py-2 text-sm font-bold"
                style={{ borderColor: "var(--line)", background: "var(--accent)", color: "#fff" }}
              >
                Start Break
              </button>
              <button
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
                      sessionFocusSeconds: 0
                    }
                  }))
                }
                className="rounded-lg border px-4 py-2 text-sm font-bold"
                style={{ borderColor: "var(--line)" }}
              >
                Next Focus
              </button>
            </div>
          </section>
        )}

        {state.screen === "calendar" && (
          <CalendarScreen state={state} setState={setState} />
        )}

        {state.screen === "stats" && (
          <section className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Today" value={minutesText(todayMinutes)} sub={`Goal ${minutesText(currentGoal)}`} />
              <StatCard label="Streak" value={`${streak}`} sub="days" />
              <StatCard label="Total Focus" value={minutesText(Math.round(totalFocusSeconds(state) / 60))} sub="all sessions" />
              <StatCard label="Completed Chapters" value={`${chapterProgress.done}`} sub={`of ${chapterProgress.total}`} />
            </div>
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
              <div className="text-xs font-extrabold uppercase" style={{ color: "var(--muted)" }}>
                Session History
              </div>
              <div className="mt-2 space-y-2">
                {[...state.history]
                  .reverse()
                  .slice(0, 40)
                  .map((h) => (
                    <div key={h.id} className="flex items-center justify-between rounded-lg border p-2" style={{ borderColor: "var(--line)" }}>
                      <div>
                        <div className="text-sm font-semibold">{h.date}</div>
                        <div className="text-xs" style={{ color: "var(--muted)" }}>
                          Unit {h.unitId} | {h.chapterId}
                        </div>
                      </div>
                      <div className="text-sm font-black">{Math.round(h.focusSeconds / 60)}m</div>
                    </div>
                  ))}
              </div>
            </div>
          </section>
        )}

        {state.screen === "settings" && (
          <section className="space-y-3">
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
              <div className="text-xs font-extrabold uppercase" style={{ color: "var(--muted)" }}>
                Daily Goal By Season
              </div>
              {(["summer", "fall", "winter", "spring"] as Season[]).map((season) => (
                <div key={season} className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold capitalize">{season}</span>
                  <input
                    type="number"
                    min={10}
                    max={600}
                    value={state.dailyGoals[season]}
                    className="w-24 rounded-md border px-2 py-1 text-sm"
                    style={{ borderColor: "var(--line)", background: "transparent" }}
                    onChange={(e) =>
                      setState((s) => ({
                        ...s,
                        dailyGoals: {
                          ...s.dailyGoals,
                          [season]: Math.max(10, Math.min(600, Number(e.target.value) || 10))
                        }
                      }))
                    }
                  />
                </div>
              ))}
            </div>
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
              <div className="text-xs font-extrabold uppercase" style={{ color: "var(--muted)" }}>
                Notifications
              </div>
              {(
                [
                  ["desktop", "Desktop"],
                  ["inApp", "In-app"],
                  ["sound", "Sound"],
                  ["sessionEnd", "Session complete"],
                  ["breakEnd", "Break complete"],
                  ["streak", "Streak milestones"],
                  ["daily", "Daily reminder"]
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="mt-2 flex items-center justify-between">
                  <span className="text-sm">{label}</span>
                  <input
                    type="checkbox"
                    checked={state.notifications[key]}
                    onChange={() =>
                      setState((s) => ({
                        ...s,
                        notifications: { ...s.notifications, [key]: !s.notifications[key] }
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          </section>
        )}
      </div>
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full px-4 py-2 text-xs font-bold text-white" style={{ background: "var(--ink)" }}>
          {toast}
        </div>
      )}
    </main>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
      <div className="text-xs font-extrabold uppercase" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div className="mt-2 text-3xl font-black">{value}</div>
      <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
        {sub}
      </div>
    </div>
  );
}

function Flashcard({
  q,
  a,
  revealed,
  onToggle,
  onNext,
  unitId
}: {
  unitId: number;
  q: string;
  a: string;
  revealed: boolean;
  onToggle: () => void;
  onNext: () => void;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full rounded-lg border p-3 text-left"
        style={{ borderColor: "var(--line)", background: "transparent" }}
      >
        <div className="text-xs font-extrabold uppercase" style={{ color: "var(--muted)" }}>
          Unit {unitId} Flashcard
        </div>
        <div className="mt-1 text-sm font-semibold">Q: {q}</div>
        <div className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          {revealed ? `A: ${a}` : "Tap to reveal answer"}
        </div>
      </button>
      <button
        onClick={onNext}
        className="mt-2 rounded-lg border px-3 py-1 text-xs font-bold"
        style={{ borderColor: "var(--line)" }}
      >
        Next Card
      </button>
    </div>
  );
}

function CalendarScreen({
  state,
  setState
}: {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}) {
  const month = new Date();
  month.setMonth(month.getMonth() + state.planMonthOffset);
  month.setDate(1);
  const monthLabel = month.toLocaleString(undefined, { month: "long", year: "numeric" });

  const firstDay = month.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), d));
  }

  return (
    <section className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
      <div className="flex items-center justify-between">
        <button
          onClick={() => setState((s) => ({ ...s, planMonthOffset: s.planMonthOffset - 1 }))}
          className="rounded-lg border px-3 py-1 text-xs font-bold"
          style={{ borderColor: "var(--line)" }}
        >
          Prev
        </button>
        <div className="text-sm font-black">{monthLabel}</div>
        <button
          onClick={() => setState((s) => ({ ...s, planMonthOffset: s.planMonthOffset + 1 }))}
          className="rounded-lg border px-3 py-1 text-xs font-bold"
          style={{ borderColor: "var(--line)" }}
        >
          Next
        </button>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs font-bold" style={{ color: "var(--muted)" }}>
        {"Sun Mon Tue Wed Thu Fri Sat".split(" ").map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((date, idx) => {
          if (!date) return <div key={`empty-${idx}`} className="h-12 rounded border" style={{ borderColor: "transparent" }} />;
          const key = dayKey(date);
          const mins = Math.round((state.dailyLog[key]?.focusSeconds ?? 0) / 60);
          const goal = goalForDate(state, date);
          const today = dayKey(date) === dayKey();
          let bg = "transparent";
          if (mins >= goal && mins > 0) bg = "rgba(31,157,85,.2)";
          else if (mins > 0) bg = "rgba(229,165,0,.2)";
          else if (dayKey(date) < dayKey()) bg = "rgba(216,63,49,.16)";
          return (
            <div
              key={key}
              className="h-12 rounded border p-1 text-xs"
              style={{ borderColor: today ? "var(--accent)" : "var(--line)", background: bg }}
            >
              <div className="font-bold">{date.getDate()}</div>
              <div style={{ color: "var(--muted)" }}>{mins}m</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
