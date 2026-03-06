import { getDatabase } from "@/lib/cloudbase-service";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { MarketRegion } from "@/lib/market/referrals";

type AnalyticsRegion = "CN" | "INTL" | "ALL";

const CN_USERS_COLLECTION = "web_users";
const CN_CONVERSATIONS_COLLECTION = "ai_conversations";

const MIN_DAYS = 14;
const MAX_DAYS = 120;
const DEFAULT_DAYS = 30;

const FIRST_USE_LATENCY_BUCKETS = [
  { key: "under_1h", label: "< 1小时", minHours: 0, maxHours: 1 },
  { key: "under_24h", label: "1-24小时", minHours: 1, maxHours: 24 },
  { key: "under_3d", label: "1-3天", minHours: 24, maxHours: 72 },
  { key: "under_7d", label: "3-7天", minHours: 72, maxHours: 168 },
  {
    key: "over_7d",
    label: "> 7天",
    minHours: 168,
    maxHours: Number.POSITIVE_INFINITY,
  },
] as const;

const TOOL_NAME_MAP: Record<string, string> = {
  chat: "聊天",
  unknown: "未知工具",
};

interface AnalyticsUser {
  userId: string;
  createdAt: Date;
}

interface UsageEvent {
  userId: string;
  createdAt: Date;
  toolId: string;
}

export interface MarketAnalyticsOverview {
  totalUsers: number;
  newUsersInRange: number;
  activeUsersInRange: number;
  activeUsers7d: number;
  activeUsers30d: number;
  activeRate7d: number;
  activeRate30d: number;
  firstUseRate7dForNewUsers30d: number;
  avgUsageEventsPerActiveUser30d: number;
  medianFirstUseHours: number;
  totalUsageEventsInRange: number;
}

export interface MarketAnalyticsTrendPoint {
  date: string;
  newUsers: number;
  dau: number;
  wau: number;
  usageEvents: number;
  firstUseUsers: number;
}

export interface MarketAnalyticsCohortPoint {
  cohortDate: string;
  newUsers: number;
  d1Users: number;
  d3Users: number;
  d7Users: number;
  d14Users: number;
  d30Users: number;
  d1Rate: number;
  d3Rate: number;
  d7Rate: number;
  d14Rate: number;
  d30Rate: number;
}

export interface MarketAnalyticsRetentionSummary {
  cohortUsers: number;
  d1Rate: number;
  d3Rate: number;
  d7Rate: number;
  d14Rate: number;
  d30Rate: number;
}

export interface MarketAnalyticsHabitBucket {
  label: string;
  events: number;
  activeUsers: number;
  share: number;
}

export interface MarketAnalyticsToolHabit {
  toolId: string;
  toolName: string;
  events: number;
  activeUsers: number;
  share: number;
}

export interface MarketAnalyticsFirstUseTool {
  toolId: string;
  toolName: string;
  users: number;
  share: number;
}

export interface MarketAnalyticsFirstUseLatency {
  bucket: string;
  label: string;
  users: number;
  share: number;
}

export interface MarketAnalyticsSegment {
  label: string;
  users: number;
  share: number;
}

export interface MarketAnalyticsData {
  region: AnalyticsRegion;
  generatedAt: string;
  rangeDays: number;
  overview: MarketAnalyticsOverview;
  retention: {
    summary: MarketAnalyticsRetentionSummary;
    cohorts: MarketAnalyticsCohortPoint[];
  };
  trends: MarketAnalyticsTrendPoint[];
  habits: {
    byWeekday: MarketAnalyticsHabitBucket[];
    byHour: MarketAnalyticsHabitBucket[];
    topTools: MarketAnalyticsToolHabit[];
  };
  firstUse: {
    topTools: MarketAnalyticsFirstUseTool[];
    latencyDistribution: MarketAnalyticsFirstUseLatency[];
  };
  segmentation: {
    recency: MarketAnalyticsSegment[];
    frequency30d: MarketAnalyticsSegment[];
  };
}

function toRate(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function parseDays(days?: number | string) {
  const parsed = Number(days);
  if (!Number.isFinite(parsed)) return DEFAULT_DAYS;
  return Math.max(MIN_DAYS, Math.min(MAX_DAYS, Math.floor(parsed)));
}

function normalizeUserId(value: any) {
  const raw = String(value || "").trim();
  return raw ? raw.slice(0, 128) : null;
}

function parseDate(value: any) {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function utcStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildDateKeys(days: number) {
  const safeDays = parseDays(days);
  const end = utcStart(new Date());
  const keys: string[] = [];
  for (let i = safeDays - 1; i >= 0; i -= 1) {
    keys.push(toDateKey(addUtcDays(end, -i)));
  }
  return keys;
}

function getHourDiff(start: Date, end: Date) {
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
}

function getDayDiff(start: Date, end: Date) {
  const a = utcStart(start).getTime();
  const b = utcStart(end).getTime();
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));
  }
  return Number(sorted[mid].toFixed(2));
}

function resolveToolName(toolId: string) {
  return TOOL_NAME_MAP[toolId] || toolId;
}

function normalizeRegion(region?: MarketRegion): AnalyticsRegion {
  const raw = String(region || "ALL").trim().toUpperCase();
  if (raw === "CN" || raw === "INTL" || raw === "ALL") {
    return raw;
  }
  return "ALL";
}

function resolveReadRegions(region: AnalyticsRegion): Array<"CN" | "INTL"> {
  if (region === "CN") return ["CN"];
  if (region === "INTL") return ["INTL"];
  return ["INTL", "CN"];
}

function extractToolId(message: any) {
  const model = String(message?.model || message?.agentId || "").trim().toLowerCase();
  if (model) return model;
  return "chat";
}

function collectSessionUsageEvents(row: any): UsageEvent[] {
  const userId = normalizeUserId(row?.user_id || row?.userId || row?._id);
  if (!userId) return [];

  const messages = Array.isArray(row?.messages) ? row.messages : [];
  const fallbackTime = parseDate(row?.updated_at || row?.created_at) || new Date();
  const events: UsageEvent[] = [];

  for (const message of messages) {
    if (String(message?.role || "") !== "assistant") {
      continue;
    }

    const createdAt = parseDate(message?.timestamp) || fallbackTime;
    events.push({
      userId,
      createdAt,
      toolId: extractToolId(message),
    });
  }

  return events;
}

async function listAllIntlUsers() {
  const users: AnalyticsUser[] = [];
  const perPage = 1000;
  let page = 1;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(error.message);
    }

    const rows = data?.users || [];
    for (const row of rows) {
      const userId = normalizeUserId(row.id);
      const createdAt = parseDate(row.created_at);
      if (!userId || !createdAt) continue;
      users.push({ userId, createdAt });
    }

    if (rows.length < perPage) {
      break;
    }
    page += 1;
  }

  return users;
}

async function loadIntlUsersAndEvents(days: number) {
  const users = await listAllIntlUsers();
  const fromIso = addUtcDays(utcStart(new Date()), -parseDays(days) - 32).toISOString();

  const { data: sessions, error } = await supabaseAdmin
    .from("gpt_sessions")
    .select("user_id,messages,created_at,updated_at")
    .gte("updated_at", fromIso);

  if (error) {
    throw new Error(error.message);
  }

  const usageEvents: UsageEvent[] = [];
  for (const row of sessions || []) {
    usageEvents.push(...collectSessionUsageEvents(row));
  }

  return { users, usageEvents };
}

async function loadCnUsersAndEvents(days: number) {
  const db = getDatabase();

  const [usersResult, sessionsResult] = await Promise.all([
    db.collection(CN_USERS_COLLECTION).get(),
    db.collection(CN_CONVERSATIONS_COLLECTION).get(),
  ]);

  const users: AnalyticsUser[] = [];
  for (const row of usersResult?.data || []) {
    const userId = normalizeUserId(row?._id || row?.id || row?.user_id);
    const createdAt = parseDate(row?.created_at || row?.createdAt);
    if (!userId || !createdAt) continue;
    users.push({ userId, createdAt });
  }

  const usageEvents: UsageEvent[] = [];
  for (const row of sessionsResult?.data || []) {
    usageEvents.push(...collectSessionUsageEvents(row));
  }

  const fromDate = addUtcDays(utcStart(new Date()), -parseDays(days) - 32);
  return {
    users,
    usageEvents: usageEvents.filter((event) => event.createdAt >= fromDate),
  };
}

function combineDatasets(
  chunks: Array<{ users: AnalyticsUser[]; usageEvents: UsageEvent[] }>
) {
  const userMap = new Map<string, AnalyticsUser>();
  const usageEvents: UsageEvent[] = [];

  for (const chunk of chunks) {
    for (const user of chunk.users) {
      const existing = userMap.get(user.userId);
      if (!existing || existing.createdAt > user.createdAt) {
        userMap.set(user.userId, user);
      }
    }
    usageEvents.push(...chunk.usageEvents);
  }

  return {
    users: Array.from(userMap.values()),
    usageEvents,
  };
}

function buildMarketAnalyticsData(params: {
  region: AnalyticsRegion;
  days: number;
  users: AnalyticsUser[];
  usageEvents: UsageEvent[];
}): MarketAnalyticsData {
  const { region, days, users, usageEvents } = params;
  const rangeDays = parseDays(days);
  const now = new Date();
  const startDate = addUtcDays(utcStart(now), -rangeDays + 1);
  const startDateKey = toDateKey(startDate);
  const dateKeys = buildDateKeys(rangeDays);

  const usersById = new Map<string, AnalyticsUser>();
  for (const user of users) {
    usersById.set(user.userId, user);
  }

  const eventsInRange = usageEvents.filter((event) => event.createdAt >= startDate);
  const eventsIn7d = usageEvents.filter(
    (event) => event.createdAt >= addUtcDays(utcStart(now), -6)
  );
  const eventsIn30d = usageEvents.filter(
    (event) => event.createdAt >= addUtcDays(utcStart(now), -29)
  );

  const activeUsersInRangeSet = new Set(eventsInRange.map((item) => item.userId));
  const activeUsers7dSet = new Set(eventsIn7d.map((item) => item.userId));
  const activeUsers30dSet = new Set(eventsIn30d.map((item) => item.userId));

  const newUsersInRange = users.filter((user) => toDateKey(user.createdAt) >= startDateKey);
  const newUsers30d = users.filter(
    (user) => user.createdAt >= addUtcDays(utcStart(now), -29)
  );

  const firstUseByUser = new Map<string, UsageEvent>();
  for (const event of usageEvents) {
    const existing = firstUseByUser.get(event.userId);
    if (!existing || existing.createdAt > event.createdAt) {
      firstUseByUser.set(event.userId, event);
    }
  }

  const lastUseByUser = new Map<string, UsageEvent>();
  for (const event of usageEvents) {
    const existing = lastUseByUser.get(event.userId);
    if (!existing || existing.createdAt < event.createdAt) {
      lastUseByUser.set(event.userId, event);
    }
  }

  const firstUseHours: number[] = [];
  for (const user of users) {
    const firstUse = firstUseByUser.get(user.userId);
    if (!firstUse) continue;
    const diffHours = getHourDiff(user.createdAt, firstUse.createdAt);
    if (Number.isFinite(diffHours) && diffHours >= 0) {
      firstUseHours.push(diffHours);
    }
  }

  let newUsers30dWithFirstUseWithin7d = 0;
  for (const user of newUsers30d) {
    const firstUse = firstUseByUser.get(user.userId);
    if (!firstUse) continue;
    const diff = getHourDiff(user.createdAt, firstUse.createdAt);
    if (diff >= 0 && diff <= 24 * 7) {
      newUsers30dWithFirstUseWithin7d += 1;
    }
  }

  const usageEventsByDay = new Map<string, number>();
  const newUsersByDay = new Map<string, number>();
  const firstUseUsersByDay = new Map<string, Set<string>>();
  const dailyActiveUsersByDay = new Map<string, Set<string>>();

  for (const key of dateKeys) {
    usageEventsByDay.set(key, 0);
    newUsersByDay.set(key, 0);
    firstUseUsersByDay.set(key, new Set());
    dailyActiveUsersByDay.set(key, new Set());
  }

  for (const user of users) {
    const key = toDateKey(user.createdAt);
    if (!newUsersByDay.has(key)) continue;
    newUsersByDay.set(key, (newUsersByDay.get(key) || 0) + 1);
  }

  for (const event of usageEvents) {
    const key = toDateKey(event.createdAt);
    if (!usageEventsByDay.has(key)) continue;

    usageEventsByDay.set(key, (usageEventsByDay.get(key) || 0) + 1);
    dailyActiveUsersByDay.get(key)?.add(event.userId);
  }

  for (const [userId, event] of firstUseByUser.entries()) {
    const key = toDateKey(event.createdAt);
    if (!firstUseUsersByDay.has(key)) continue;
    firstUseUsersByDay.get(key)?.add(userId);
  }

  const trends: MarketAnalyticsTrendPoint[] = dateKeys.map((key, index) => {
    const cursorDate = parseDate(`${key}T00:00:00.000Z`) || startDate;
    const wauWindowStart = addUtcDays(cursorDate, -6);
    const wauUsers = new Set<string>();

    for (const event of usageEvents) {
      if (event.createdAt < wauWindowStart || event.createdAt > addUtcDays(cursorDate, 1)) {
        continue;
      }
      wauUsers.add(event.userId);
    }

    return {
      date: key,
      newUsers: newUsersByDay.get(key) || 0,
      dau: dailyActiveUsersByDay.get(key)?.size || 0,
      wau: wauUsers.size,
      usageEvents: usageEventsByDay.get(key) || 0,
      firstUseUsers: firstUseUsersByDay.get(key)?.size || 0,
    };
  });

  const retentionCohorts: MarketAnalyticsCohortPoint[] = [];
  const retentionUsersInRange = users.filter((user) => user.createdAt >= startDate);

  const eventsByUser = new Map<string, UsageEvent[]>();
  for (const event of usageEvents) {
    const list = eventsByUser.get(event.userId) || [];
    list.push(event);
    eventsByUser.set(event.userId, list);
  }

  const cohortByDate = new Map<string, AnalyticsUser[]>();
  for (const user of retentionUsersInRange) {
    const key = toDateKey(user.createdAt);
    const list = cohortByDate.get(key) || [];
    list.push(user);
    cohortByDate.set(key, list);
  }

  for (const [cohortDate, cohortUsers] of Array.from(cohortByDate.entries()).sort()) {
    const checkpointUsers = {
      d1: 0,
      d3: 0,
      d7: 0,
      d14: 0,
      d30: 0,
    };

    for (const user of cohortUsers) {
      const userEvents = eventsByUser.get(user.userId) || [];
      const daysSet = new Set<number>();
      for (const event of userEvents) {
        const diff = getDayDiff(user.createdAt, event.createdAt);
        if (diff >= 0) {
          daysSet.add(diff);
        }
      }

      if (Array.from(daysSet).some((day) => day >= 1)) checkpointUsers.d1 += 1;
      if (Array.from(daysSet).some((day) => day >= 3)) checkpointUsers.d3 += 1;
      if (Array.from(daysSet).some((day) => day >= 7)) checkpointUsers.d7 += 1;
      if (Array.from(daysSet).some((day) => day >= 14)) checkpointUsers.d14 += 1;
      if (Array.from(daysSet).some((day) => day >= 30)) checkpointUsers.d30 += 1;
    }

    retentionCohorts.push({
      cohortDate,
      newUsers: cohortUsers.length,
      d1Users: checkpointUsers.d1,
      d3Users: checkpointUsers.d3,
      d7Users: checkpointUsers.d7,
      d14Users: checkpointUsers.d14,
      d30Users: checkpointUsers.d30,
      d1Rate: toRate(checkpointUsers.d1, cohortUsers.length),
      d3Rate: toRate(checkpointUsers.d3, cohortUsers.length),
      d7Rate: toRate(checkpointUsers.d7, cohortUsers.length),
      d14Rate: toRate(checkpointUsers.d14, cohortUsers.length),
      d30Rate: toRate(checkpointUsers.d30, cohortUsers.length),
    });
  }

  const retentionSummary = {
    cohortUsers: retentionCohorts.reduce((sum, row) => sum + row.newUsers, 0),
    d1Rate: toRate(
      retentionCohorts.reduce((sum, row) => sum + row.d1Users, 0),
      retentionCohorts.reduce((sum, row) => sum + row.newUsers, 0)
    ),
    d3Rate: toRate(
      retentionCohorts.reduce((sum, row) => sum + row.d3Users, 0),
      retentionCohorts.reduce((sum, row) => sum + row.newUsers, 0)
    ),
    d7Rate: toRate(
      retentionCohorts.reduce((sum, row) => sum + row.d7Users, 0),
      retentionCohorts.reduce((sum, row) => sum + row.newUsers, 0)
    ),
    d14Rate: toRate(
      retentionCohorts.reduce((sum, row) => sum + row.d14Users, 0),
      retentionCohorts.reduce((sum, row) => sum + row.newUsers, 0)
    ),
    d30Rate: toRate(
      retentionCohorts.reduce((sum, row) => sum + row.d30Users, 0),
      retentionCohorts.reduce((sum, row) => sum + row.newUsers, 0)
    ),
  };

  const weekdayMap = new Map<number, { events: number; users: Set<string> }>();
  const hourMap = new Map<number, { events: number; users: Set<string> }>();
  const toolMap = new Map<string, { events: number; users: Set<string> }>();

  for (const event of eventsInRange) {
    const weekday = event.createdAt.getUTCDay();
    const hour = event.createdAt.getUTCHours();

    const weekdayBucket = weekdayMap.get(weekday) || { events: 0, users: new Set<string>() };
    weekdayBucket.events += 1;
    weekdayBucket.users.add(event.userId);
    weekdayMap.set(weekday, weekdayBucket);

    const hourBucket = hourMap.get(hour) || { events: 0, users: new Set<string>() };
    hourBucket.events += 1;
    hourBucket.users.add(event.userId);
    hourMap.set(hour, hourBucket);

    const toolBucket = toolMap.get(event.toolId) || { events: 0, users: new Set<string>() };
    toolBucket.events += 1;
    toolBucket.users.add(event.userId);
    toolMap.set(event.toolId, toolBucket);
  }

  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const totalEventsInRange = eventsInRange.length;

  const byWeekday: MarketAnalyticsHabitBucket[] = Array.from({ length: 7 }).map((_, weekday) => {
    const bucket = weekdayMap.get(weekday) || { events: 0, users: new Set<string>() };
    return {
      label: weekdayLabels[weekday],
      events: bucket.events,
      activeUsers: bucket.users.size,
      share: toRate(bucket.events, totalEventsInRange || 1),
    };
  });

  const byHour: MarketAnalyticsHabitBucket[] = Array.from({ length: 24 }).map((_, hour) => {
    const bucket = hourMap.get(hour) || { events: 0, users: new Set<string>() };
    return {
      label: `${hour.toString().padStart(2, "0")}:00`,
      events: bucket.events,
      activeUsers: bucket.users.size,
      share: toRate(bucket.events, totalEventsInRange || 1),
    };
  });

  const topTools: MarketAnalyticsToolHabit[] = Array.from(toolMap.entries())
    .map(([toolId, bucket]) => ({
      toolId,
      toolName: resolveToolName(toolId),
      events: bucket.events,
      activeUsers: bucket.users.size,
      share: toRate(bucket.events, totalEventsInRange || 1),
    }))
    .sort((a, b) => (b.events === a.events ? b.activeUsers - a.activeUsers : b.events - a.events))
    .slice(0, 12);

  const firstUseToolMap = new Map<string, number>();
  for (const firstUse of firstUseByUser.values()) {
    firstUseToolMap.set(firstUse.toolId, (firstUseToolMap.get(firstUse.toolId) || 0) + 1);
  }

  const firstUseTopTools: MarketAnalyticsFirstUseTool[] = Array.from(firstUseToolMap.entries())
    .map(([toolId, usersCount]) => ({
      toolId,
      toolName: resolveToolName(toolId),
      users: usersCount,
      share: toRate(usersCount, firstUseByUser.size || 1),
    }))
    .sort((a, b) => b.users - a.users)
    .slice(0, 12);

  const latencyDistribution = FIRST_USE_LATENCY_BUCKETS.map((bucket) => {
    const usersCount = users.filter((user) => {
      const firstUse = firstUseByUser.get(user.userId);
      if (!firstUse) return false;
      const diff = getHourDiff(user.createdAt, firstUse.createdAt);
      return diff >= bucket.minHours && diff < bucket.maxHours;
    }).length;

    return {
      bucket: bucket.key,
      label: bucket.label,
      users: usersCount,
      share: toRate(usersCount, firstUseByUser.size || 1),
    };
  });

  const recencyBuckets = {
    "0-1d": 0,
    "2-7d": 0,
    "8-30d": 0,
    "31+d": 0,
    never: 0,
  };

  for (const user of users) {
    const lastUse = lastUseByUser.get(user.userId);
    if (!lastUse) {
      recencyBuckets.never += 1;
      continue;
    }

    const daysFromNow = getDayDiff(lastUse.createdAt, now);
    if (daysFromNow <= 1) recencyBuckets["0-1d"] += 1;
    else if (daysFromNow <= 7) recencyBuckets["2-7d"] += 1;
    else if (daysFromNow <= 30) recencyBuckets["8-30d"] += 1;
    else recencyBuckets["31+d"] += 1;
  }

  const recency = Object.entries(recencyBuckets).map(([label, usersCount]) => ({
    label,
    users: usersCount,
    share: toRate(usersCount, users.length || 1),
  }));

  const events30dByUser = new Map<string, number>();
  for (const event of eventsIn30d) {
    events30dByUser.set(event.userId, (events30dByUser.get(event.userId) || 0) + 1);
  }

  const freqBuckets = {
    "0": 0,
    "1": 0,
    "2-5": 0,
    "6-15": 0,
    "16+": 0,
  };

  for (const user of users) {
    const count = events30dByUser.get(user.userId) || 0;
    if (count === 0) freqBuckets["0"] += 1;
    else if (count === 1) freqBuckets["1"] += 1;
    else if (count <= 5) freqBuckets["2-5"] += 1;
    else if (count <= 15) freqBuckets["6-15"] += 1;
    else freqBuckets["16+"] += 1;
  }

  const frequency30d = Object.entries(freqBuckets).map(([label, usersCount]) => ({
    label,
    users: usersCount,
    share: toRate(usersCount, users.length || 1),
  }));

  return {
    region,
    generatedAt: new Date().toISOString(),
    rangeDays,
    overview: {
      totalUsers: users.length,
      newUsersInRange: newUsersInRange.length,
      activeUsersInRange: activeUsersInRangeSet.size,
      activeUsers7d: activeUsers7dSet.size,
      activeUsers30d: activeUsers30dSet.size,
      activeRate7d: toRate(activeUsers7dSet.size, users.length || 1),
      activeRate30d: toRate(activeUsers30dSet.size, users.length || 1),
      firstUseRate7dForNewUsers30d: toRate(
        newUsers30dWithFirstUseWithin7d,
        newUsers30d.length || 1
      ),
      avgUsageEventsPerActiveUser30d: Number(
        (eventsIn30d.length / Math.max(1, activeUsers30dSet.size)).toFixed(2)
      ),
      medianFirstUseHours: median(firstUseHours),
      totalUsageEventsInRange: eventsInRange.length,
    },
    retention: {
      summary: retentionSummary,
      cohorts: retentionCohorts,
    },
    trends,
    habits: {
      byWeekday,
      byHour,
      topTools,
    },
    firstUse: {
      topTools: firstUseTopTools,
      latencyDistribution,
    },
    segmentation: {
      recency,
      frequency30d,
    },
  };
}

export async function getMarketAdminAnalytics(input?: {
  days?: number | string;
  region?: MarketRegion;
}): Promise<MarketAnalyticsData> {
  const days = parseDays(input?.days);
  const region = normalizeRegion(input?.region);
  const targets = resolveReadRegions(region);

  const chunks: Array<{ users: AnalyticsUser[]; usageEvents: UsageEvent[] }> = [];

  for (const target of targets) {
    if (target === "INTL") {
      const intlData = await loadIntlUsersAndEvents(days).catch(() => null);
      if (intlData) chunks.push(intlData);
      continue;
    }

    const cnData = await loadCnUsersAndEvents(days).catch(() => null);
    if (cnData) chunks.push(cnData);
  }

  const dataset = combineDatasets(chunks);

  return buildMarketAnalyticsData({
    region,
    days,
    users: dataset.users,
    usageEvents: dataset.usageEvents,
  });
}
