export function watchedKey(userId: string, tmdbId: number): string {
  return `${userId}/watched/${tmdbId}`;
}

export function watchedPrefix(userId: string): string {
  return `${userId}/watched/`;
}

export function dismissedKey(userId: string, tmdbId: number): string {
  return `${userId}/dismissed/${tmdbId}`;
}

export function dismissedPrefix(userId: string): string {
  return `${userId}/dismissed/`;
}

export function queueKey(userId: string, tmdbId: number): string {
  return `${userId}/queue/${tmdbId}`;
}

export function queuePrefix(userId: string): string {
  return `${userId}/queue/`;
}

export function pendingQueueKey(userId: string, pendingId: string): string {
  return `${userId}/queue/pending-${pendingId}`;
}

export function seenKey(userId: string, tmdbId: number): string {
  return `${userId}/seen/${tmdbId}`;
}

export function seenPrefix(userId: string): string {
  return `${userId}/seen/`;
}

export function preferencesKey(userId: string): string {
  return `${userId}/preferences`;
}

export function tasteProfileKey(userId: string): string {
  return `${userId}/taste-profile`;
}

export function onboardingKey(userId: string): string {
  return `${userId}/onboarding`;
}

export function settingsKey(userId: string): string {
  return `${userId}/settings`;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
