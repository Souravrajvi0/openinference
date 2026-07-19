export type Lang = "Python" | "JavaScript" | "curl";

export function quickstart(lang: Lang, origin: string): string {
  switch (lang) {
    case "Python":
      return `from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="${origin}/v1",
)

resp = client.chat.completions.create(
    model="llama-3.1-8b-instant",
    messages=[{"role": "user", "content": "Explain fast language models"}],
)
print(resp.choices[0].message.content)`;
    case "JavaScript":
      return `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "YOUR_API_KEY",
  baseURL: "${origin}/v1",
});

const resp = await client.chat.completions.create({
  model: "llama-3.1-8b-instant",
  messages: [{ role: "user", content: "Explain fast language models" }],
});
console.log(resp.choices[0].message.content);`;
    case "curl":
      return `curl -X POST ${origin}/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "llama-3.1-8b-instant",
    "messages": [{"role": "user", "content": "Explain fast language models"}]
  }'`;
  }
}

export function listModelsSnippet(lang: Lang, origin: string): string {
  switch (lang) {
    case "Python":
      return `for m in client.models.list():
    print(m.id, m.owned_by)`;
    case "JavaScript":
      return `for await (const m of client.models.list()) {
  console.log(m.id, m.owned_by);
}`;
    case "curl":
      return `curl ${origin}/v1/models -H "Authorization: Bearer YOUR_API_KEY"`;
  }
}

export function streamingSnippet(lang: Lang, origin: string): string {
  switch (lang) {
    case "Python":
      return `stream = client.chat.completions.create(
    model="llama-3.1-8b-instant",
    messages=[{"role": "user", "content": "Write a haiku about gateways"}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="", flush=True)`;
    case "JavaScript":
      return `const stream = await client.chat.completions.create({
  model: "llama-3.1-8b-instant",
  messages: [{ role: "user", content: "Write a haiku about gateways" }],
  stream: true,
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}`;
    case "curl":
      return `curl -N -X POST ${origin}/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "llama-3.1-8b-instant",
    "stream": true,
    "messages": [{"role": "user", "content": "Write a haiku about gateways"}]
  }'`;
  }
}

export function envKeySnippet(): string {
  return `export OPENINFERENCE_API_KEY=your_api_key_here
# or for OpenAI SDKs:
export OPENAI_API_KEY=your_api_key_here
export OPENAI_BASE_URL=https://YOUR_GATEWAY/v1`;
}

export function nativeChatSnippet(origin: string): string {
  return `curl -X POST ${origin}/v1/chat \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "llama-3.1-8b-instant",
    "provider": "groq",
    "session_id": "11111111-1111-1111-1111-111111111111",
    "rag": { "enabled": true, "top_k": 5 },
    "messages": [
      {"role": "user", "content": "What does our privacy policy say about retention?"}
    ]
  }'`;
}
