import { describe, it, expect, vi } from 'vitest';

vi.mock('../../config', () => ({
  config: { DEFAULT_MODEL: 'llama-3.3-70b-versatile' },
}));

import { isModelAllowedForAgent, resolveAgentModel } from '../agentPolicy';

describe('agentPolicy', () => {
  it('defaults to platform model when no agent config', () => {
    expect(resolveAgentModel(undefined, null)).toBe('llama-3.3-70b-versatile');
  });

  it('uses first allowed model when agent restricts models', () => {
    const agent = { allowed_models: ['llama-3.1-8b-instant', 'gemma3:1b'] };
    expect(resolveAgentModel(undefined, agent)).toBe('llama-3.1-8b-instant');
  });

  it('rejects models outside the agent allow-list', () => {
    const agent = { allowed_models: ['llama-3.1-8b-instant'] };
    expect(isModelAllowedForAgent('claude-3-5-sonnet-20241022', agent)).toBe(false);
    expect(isModelAllowedForAgent('llama-3.1-8b-instant', agent)).toBe(true);
  });

  it('allows unspecified model when agent will pick a default', () => {
    const agent = { allowed_models: ['llama-3.1-8b-instant'] };
    expect(isModelAllowedForAgent(undefined, agent)).toBe(true);
  });
});
