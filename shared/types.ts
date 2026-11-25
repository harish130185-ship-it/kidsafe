export type AppCategory = 
  | 'Education' 
  | 'Entertainment' 
  | 'Games' 
  | 'Social' 
  | 'Productivity' 
  | 'System' 
  | 'Other';

export interface Child {
  id: string;
  name: string;
  age: number;
  avatar: string;
  deviceName: string;
  deviceModel: string;
  batteryLevel: number;
  isOnline: boolean;
  lastSyncAt: number;
  dailyLimitMinutes: number;
}

export interface AppUsage {
  package: string;
  name: string;
  category: AppCategory;
  durationMs: number;
  icon?: string;
  limitMinutes?: number;
  sessionCount?: number;
}

export type TimelineEventType = 
  | 'opened' 
  | 'closed' 
  | 'screen_unlocked' 
  | 'screen_off' 
  | 'limit_reached' 
  | 'blocked_attempt';

export interface TimelineEvent {
  id: string;
  package: string;
  name: string;
  event: TimelineEventType;
  time: number;
  durationMs?: number;
  category: AppCategory;
  confidence: 'high' | 'approximate';
  source: 'UsageStats' | 'Accessibility' | 'DeviceAdmin';
}

export interface DailyReport {
  day: string; // YYYY-MM-DD
  childId: string;
  totalScreenTimeMs: number;
  screenUnlocksApprox: number;
  apps: AppUsage[];
  timeline: TimelineEvent[];
  hourlyActivity: number[]; // 24 slots (minutes each hour)
  categoryBreakdown: Record<AppCategory, number>; // minutes
  receivedAt: number;
}

export interface AppLimitRule {
  package: string;
  name: string;
  category: AppCategory;
  dailyLimitMinutes: number;
  isBlocked: boolean;
  scheduleStart?: string; // HH:mm
  scheduleEnd?: string; // HH:mm
}

export interface ParentAlert {
  id: string;
  childId: string;
  childName: string;
  type: 'limit_reached' | 'night_usage' | 'permission_tamper' | 'new_app';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'danger';
  timestamp: number;
  isRead: boolean;
}

export interface ParentDashboardData {
  child: Child;
  availableChildren: Child[];
  currentDate: string;
  summary: {
    todayScreenTimeMs: number;
    yesterdayScreenTimeMs: number;
    unlocksCount: number;
    totalAppsUsed: number;
    dailyLimitMinutes: number;
    limitStatus: 'within_limit' | 'approaching_limit' | 'exceeded';
    syncStatus: 'synced' | 'delayed' | 'offline';
    lastSyncTimestamp: number;
  };
  charts: {
    hourlyActivity: { hour: number; label: string; minutes: number }[];
    sevenDayTrend: { day: string; label: string; minutes: number; limit: number }[];
    categoryDistribution: { category: AppCategory; minutes: number; percentage: number; color: string }[];
  };
  mostUsedApps: AppUsage[];
  timeline: TimelineEvent[];
  alerts: ParentAlert[];
  limits: AppLimitRule[];
}
