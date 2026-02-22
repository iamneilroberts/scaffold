import { describe, it, expect } from 'vitest';
import {
  watchedKey, watchedPrefix,
  dismissedKey, dismissedPrefix,
  preferencesKey, tasteProfileKey,
  generateId,
} from '../keys.js';

describe('storage keys', () => {
  const userId = 'user-abc';

  it('generates watched keys', () => {
    expect(watchedKey(userId, 12345)).toBe('user-abc/watched/12345');
    expect(watchedPrefix(userId)).toBe('user-abc/watched/');
  });

  it('generates dismissed keys', () => {
    expect(dismissedKey(userId, 67890)).toBe('user-abc/dismissed/67890');
    expect(dismissedPrefix(userId)).toBe('user-abc/dismissed/');
  });

  it('generates singleton keys', () => {
    expect(preferencesKey(userId)).toBe('user-abc/preferences');
    expect(tasteProfileKey(userId)).toBe('user-abc/taste-profile');
  });

  it('generates unique IDs', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
    expect(id1.length).toBeGreaterThan(6);
  });
});
