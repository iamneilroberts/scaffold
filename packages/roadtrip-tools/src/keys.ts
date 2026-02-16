import type { ToolContext } from '@voygent/scaffold-core';
import { InMemoryAdapter } from '@voygent/scaffold-core';

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Spot keys
export function spotKey(userId: string, spotId: string): string {
  return `${userId}/spots/${spotId}`;
}
export function spotsPrefix(userId: string): string {
  return `${userId}/spots/`;
}

// DrivingDay keys
export function driveKey(userId: string, driveId: string): string {
  return `${userId}/drives/${driveId}`;
}
export function drivesPrefix(userId: string): string {
  return `${userId}/drives/`;
}

// Position key (singleton per user)
export function positionKey(userId: string): string {
  return `${userId}/position/current`;
}

// DayPlan keys
export function planKey(userId: string, planId: string): string {
  return `${userId}/plans/${planId}`;
}
export function plansPrefix(userId: string): string {
  return `${userId}/plans/`;
}

// TravelerLog keys
export function logKey(userId: string, logId: string): string {
  return `${userId}/logs/${logId}`;
}
export function logsPrefix(userId: string): string {
  return `${userId}/logs/`;
}

// Knowledge keys
export function knowledgeKey(topic: string): string {
  return `_knowledge/${topic}`;
}
export function knowledgePrefix(): string {
  return `_knowledge/`;
}

export function makeTestCtx(storage?: InMemoryAdapter, userId = 'user1'): ToolContext {
  return {
    authKeyHash: 'test-key-hash',
    userId,
    isAdmin: false,
    storage: storage ?? new InMemoryAdapter(),
    env: {},
    debugMode: false,
    requestId: 'req-1',
  };
}
