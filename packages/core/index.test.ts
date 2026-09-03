import { describe, it, expect } from 'vitest';
import * as core from './index.js';

describe('@scaffold/core barrel', () => {
  it('re-exports every module from one entry point', () => {
    expect(typeof core.createMemoryStore).toBe('function');
    expect(typeof core.rubricFor).toBe('function');
    expect(typeof core.mintOfferRef).toBe('function');
    expect(typeof core.commitAction).toBe('function');
    expect(typeof core.renderView).toBe('function');
    expect(typeof core.freezeRelease).toBe('function');
    expect(typeof core.deskPayload).toBe('function');
    expect(typeof core.newCase).toBe('function');
    expect(typeof core.stageOffers).toBe('function');
    expect(typeof core.putRelease).toBe('function');
  });
});
