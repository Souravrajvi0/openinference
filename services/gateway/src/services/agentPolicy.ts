import { config } from '../config';

type AgentModelConfig = {
  allowed_models: string[];
} | null;

/** Pick the model for an agent run, honouring registry allow-lists. */
export function resolveAgentModel(
  requested: string | undefined,
  agentConfig: AgentModelConfig,
): string {
  if (agentConfig?.allowed_models?.length) {
    if (requested) return requested;
    return agentConfig.allowed_models[0]!;
  }
  return requested ?? config.DEFAULT_MODEL;
}

export function isModelAllowedForAgent(
  model: string | undefined,
  agentConfig: AgentModelConfig,
): boolean {
  if (!agentConfig?.allowed_models?.length) return true;
  if (!model) return true;
  return agentConfig.allowed_models.includes(model);
}
