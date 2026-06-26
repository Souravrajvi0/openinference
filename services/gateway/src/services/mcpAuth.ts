import { decryptSecret } from './secrets';

type McpAuthServer = {
  auth_type: string;
  auth_header: string | null;
  auth_value: string | null;
};

export function mcpAuthHeaders(server: McpAuthServer): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const secret = decryptSecret(server.auth_value);
  if (server.auth_type === 'bearer' && secret) {
    headers['Authorization'] = `Bearer ${secret}`;
  } else if (server.auth_type === 'api_key' && server.auth_header && secret) {
    headers[server.auth_header] = secret;
  }
  return headers;
}
