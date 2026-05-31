import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type IncomingState = {
  darkMode?: boolean;
  dailyGoals?: {
    summer?: number;
    fall?: number;
    winter?: number;
    spring?: number;
  };
  notifications?: {
    sessionEnd?: boolean;
    breakEnd?: boolean;
    daily?: boolean;
    streak?: boolean;
  };
  completedChapters?: Record<string, boolean>;
  notesByUnit?: Record<string, string>;
  dailyLog?: Record<string, { focusSeconds: number; sessions: number }>;
  history?: {
    id: string;
    date: string;
    unitId: number;
    chapterId: string;
    focusSeconds: number;
  }[];
};

function getBaseClient() {
  if (!url || !anon) return null;
  return createClient(url, anon);
}

function getAuthedClient(token: string) {
  if (!url || !anon) return null;
  return createClient(url, anon, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });
}

function getAccessToken(req: NextRequest) {
  const auth = req.headers.get("authorization");
  return auth?.startsWith("Bearer ") ? auth.slice(7) : null;
}

async function getUserId(token: string) {
  const client = getBaseClient();
  if (!client) return null;

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

function computeStatus(focusSeconds: number, goalMinutes: number) {
  const minutes = Math.round(focusSeconds / 60);
  const ratio = goalMinutes > 0 ? minutes / goalMinutes : 0;
  if (ratio >= 1) return "ahead";
  if (ratio >= 0.8) return "on_track";
  return "lagging";
}

function toIsoDateOnly(dateKey: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey;
  const d = new Date(dateKey);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

async function writeNormalizedState(
  client: ReturnType<typeof getAuthedClient>,
  userId: string,
  state: IncomingState
) {
  if (!client) return { error: "Missing Supabase client" };

  const now = new Date().toISOString();

  const settingsPayload = {
    user_id: userId,
    theme: state.darkMode ? "dark" : "light",
    goals_summer_minutes: state.dailyGoals?.summer ?? 240,
    goals_fall_minutes: state.dailyGoals?.fall ?? 120,
    goals_winter_minutes: state.dailyGoals?.winter ?? 120,
    goals_spring_minutes: state.dailyGoals?.spring ?? 120,
    notify_session_end: state.notifications?.sessionEnd ?? true,
    notify_break_end: state.notifications?.breakEnd ?? true,
    notify_daily: state.notifications?.daily ?? false,
    notify_streak: state.notifications?.streak ?? true,
    updated_at: now
  };

  const settingsRes = await client.from("user_settings").upsert(settingsPayload, { onConflict: "user_id" });
  if (settingsRes.error) return settingsRes;

  const deleteProgress = await client.from("user_chapter_progress").delete().eq("user_id", userId);
  if (deleteProgress.error) return deleteProgress;

  const completed = Object.entries(state.completedChapters ?? {})
    .filter(([, done]) => !!done)
    .map(([chapterId]) => ({
      user_id: userId,
      chapter_id: chapterId,
      completed: true,
      completed_at: now
    }));

  if (completed.length > 0) {
    const progressRes = await client.from("user_chapter_progress").insert(completed);
    if (progressRes.error) return progressRes;
  }

  const deleteNotes = await client.from("notes").delete().eq("user_id", userId);
  if (deleteNotes.error) return deleteNotes;

  const notesRows = Object.entries(state.notesByUnit ?? {})
    .filter(([, body]) => String(body ?? "").trim().length > 0)
    .map(([unitId, body]) => ({
      user_id: userId,
      unit_id: Number(unitId),
      body,
      updated_at: now
    }));

  if (notesRows.length > 0) {
    const notesRes = await client.from("notes").insert(notesRows);
    if (notesRes.error) return notesRes;
  }

  const dailyRows = Object.entries(state.dailyLog ?? {}).map(([date, row]) => {
    const season = (() => {
      const month = Number(date.slice(5, 7));
      if (month >= 7 && month <= 8) return "summer";
      if (month >= 9 && month <= 11) return "fall";
      if (month === 12 || month === 1) return "winter";
      return "spring";
    })();
    const goalMinutes =
      season === "summer"
        ? state.dailyGoals?.summer ?? 240
        : season === "fall"
        ? state.dailyGoals?.fall ?? 120
        : season === "winter"
        ? state.dailyGoals?.winter ?? 120
        : state.dailyGoals?.spring ?? 120;

    const focusSeconds = Math.round(row.focusSeconds ?? 0);
    return {
      user_id: userId,
      date: toIsoDateOnly(date),
      focus_seconds: focusSeconds,
      session_count: row.sessions ?? 0,
      goal_minutes: goalMinutes,
      status: computeStatus(focusSeconds, goalMinutes)
    };
  });

  if (dailyRows.length > 0) {
    const dailyRes = await client.from("daily_stats").upsert(dailyRows, { onConflict: "user_id,date" });
    if (dailyRes.error) return dailyRes;
  }

  const sessionRows = (state.history ?? []).map((h) => {
    const start = `${toIsoDateOnly(h.date)}T00:00:00.000Z`;
    const endMs = new Date(start).getTime() + Math.max(1, h.focusSeconds) * 1000;
    return {
      id: h.id,
      user_id: userId,
      unit_id: h.unitId,
      chapter_id: h.chapterId || null,
      session_type: "focus",
      started_at: start,
      ended_at: new Date(endMs).toISOString(),
      focus_seconds: Math.max(1, Math.round(h.focusSeconds))
    };
  });

  if (sessionRows.length > 0) {
    const sessionsRes = await client.from("study_sessions").upsert(sessionRows, { onConflict: "id" });
    if (sessionsRes.error) return sessionsRes;
  }

  return { error: null };
}

export async function GET(req: NextRequest) {
  const token = getAccessToken(req);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = await getUserId(token);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = getAuthedClient(token);
  if (!client) return null;

  if (!client) {
    return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
  }

  const { data, error } = await client
    .from("user_state")
    .select("state_json, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ state: data?.state_json ?? null, updatedAt: data?.updated_at ?? null });
}

export async function POST(req: NextRequest) {
  const token = getAccessToken(req);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = await getUserId(token);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = getAuthedClient(token);
  if (!client) {
    return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
  }

  const body = (await req.json()) as { state?: IncomingState };
  if (!body.state) {
    return NextResponse.json({ error: "Missing state payload" }, { status: 400 });
  }

  const { error } = await client.from("user_state").upsert(
    {
      user_id: userId,
      state_json: body.state,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const normalized = await writeNormalizedState(client, userId, body.state);
  if (normalized.error) {
    return NextResponse.json(
      { error: normalized.error.message ?? "Failed writing normalized data" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
