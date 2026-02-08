export function cookKey(userId: string, cookId: string): string {
  return `${userId}/cooks/${cookId}`;
}

export function cooksPrefix(userId: string): string {
  return `${userId}/cooks/`;
}

export function logKey(userId: string, cookId: string, logId: string): string {
  return `${userId}/cooks/${cookId}/logs/${logId}`;
}

export function logsPrefix(userId: string, cookId: string): string {
  return `${userId}/cooks/${cookId}/logs/`;
}

export function recipeKey(userId: string, recipeId: string): string {
  return `${userId}/recipes/${recipeId}`;
}

export function recipesPrefix(userId: string): string {
  return `${userId}/recipes/`;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
