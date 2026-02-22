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

export function preferencesKey(userId: string): string {
  return `${userId}/preferences`;
}

export function tasteProfileKey(userId: string): string {
  return `${userId}/taste-profile`;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
