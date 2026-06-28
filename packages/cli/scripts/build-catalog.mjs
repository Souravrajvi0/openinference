/**
 * Generates packages/cli/data/models.json from open-source Ollama model seeds.
 * Run: node scripts/build-catalog.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {[string, string, number, number, string, string?][]} */
const SEEDS = [
  // ── Sub-1B ──
  ['smollm2:135m', 'SmolLM2 135M', 0.135, 45, 'classification, tags'],
  ['smollm2:360m', 'SmolLM2 360M', 0.36, 50, 'light tasks'],
  ['qwen2.5:0.5b', 'Qwen 2.5 0.5B', 0.5, 52, 'fast labels'],
  ['tinyllama', 'TinyLlama 1.1B', 1.1, 48, 'tiny chat'],
  ['tinydolphin', 'TinyDolphin 1.5B', 1.5, 55, 'uncensored small'],
  ['stablelm2:1.6b', 'StableLM2 1.6B', 1.6, 54, 'chat'],
  ['olmo2:1b', 'OLMo 2 1B', 1.0, 56, 'research chat'],
  ['granite3-dense:2b', 'Granite 3 Dense 2B', 2.0, 73, 'enterprise chat'],

  // ── 1–2B ──
  ['gemma3:1b', 'Gemma 3 1B', 1.0, 68, 'chat, general'],
  ['llama3.2:1b', 'Llama 3.2 1B', 1.0, 66, 'instructions'],
  ['llama3.2:1b-instruct-q8_0', 'Llama 3.2 1B Q8', 1.0, 67, 'precise small'],
  ['qwen2.5:1.5b', 'Qwen 2.5 1.5B', 1.5, 70, 'JSON, chat'],
  ['deepseek-r1:1.5b', 'DeepSeek R1 1.5B', 1.5, 72, 'reasoning'],
  ['phi3:mini', 'Phi-3 Mini', 3.8, 74, 'reasoning small'],
  ['gemma2:2b', 'Gemma 2 2B', 2.0, 71, 'chat'],
  ['smollm2:1.7b', 'SmolLM2 1.7B', 1.7, 65, 'efficient chat'],
  ['internlm2:1.8b', 'InternLM2 1.8B', 1.8, 69, 'multilingual'],
  ['yi:1.5b', 'Yi 1.5B', 1.5, 67, 'bilingual chat'],
  ['qwen2:1.5b', 'Qwen 2 1.5B', 1.5, 66, 'chat'],
  ['orca-mini', 'Orca Mini 3B', 3.0, 58, 'teaching small'],
  ['stablelm-zephyr:3b', 'StableLM Zephyr 3B', 3.0, 68, 'chat'],

  // ── 2–4B ──
  ['llama3.2:3b', 'Llama 3.2 3B', 3.0, 76, 'general'],
  ['qwen2.5:3b', 'Qwen 2.5 3B', 3.0, 78, 'coding, JSON'],
  ['phi3.5:latest', 'Phi 3.5', 3.8, 74, 'reasoning'],
  ['gemma3:4b', 'Gemma 3 4B', 4.0, 80, 'quality chat'],
  ['gemma3:4b-it-qat', 'Gemma 3 4B QAT', 4.0, 81, 'efficient 4B'],
  ['codestral:22b-v0.1-q4_0', 'Codestral 22B Q4', 22, 88, 'coding frontier'],
  ['codegemma:2b', 'CodeGemma 2B', 2.0, 72, 'code completion'],
  ['starcoder2:3b', 'StarCoder2 3B', 3.0, 75, 'code'],
  ['deepseek-coder:1.3b', 'DeepSeek Coder 1.3B', 1.3, 70, 'code small'],
  ['wizardcoder:3b', 'WizardCoder 3B', 3.0, 71, 'code'],
  ['sqlcoder:7b', 'SQLCoder 7B', 7.0, 79, 'SQL'],
  ['llama3.2-vision:11b', 'Llama 3.2 Vision 11B', 11, 82, 'vision'],
  ['moondream:1.8b', 'Moondream 1.8B', 1.8, 64, 'vision small'],
  ['llava:7b', 'LLaVA 7B', 7.0, 76, 'vision chat'],
  ['bakllava:7b', 'BakLLaVA 7B', 7.0, 75, 'vision'],
  ['granite3-dense:8b', 'Granite 3 Dense 8B', 8.0, 83, 'enterprise'],
  ['falcon3:3b', 'Falcon 3 3B', 3.0, 70, 'chat'],
  ['openhermes:2.5-mistral-7b', 'OpenHermes Mistral 7B', 7.0, 77, 'chat tuned'],

  // ── 7–8B (sweet spot) ──
  ['mistral:7b', 'Mistral 7B', 7.0, 82, 'general'],
  ['mistral:7b-instruct', 'Mistral 7B Instruct', 7.0, 83, 'instructions'],
  ['mistral-nemo:12b', 'Mistral Nemo 12B', 12, 85, 'long context'],
  ['llama3.1:8b', 'Llama 3.1 8B', 8.0, 84, 'general, tools'],
  ['llama3.1:8b-instruct-q4_K_M', 'Llama 3.1 8B Q4', 8.0, 84, 'general'],
  ['llama3.2:3b-instruct-q4_K_M', 'Llama 3.2 3B Q4', 3.0, 76, 'fast general'],
  ['llama3.3:70b', 'Llama 3.3 70B', 70, 93, 'frontier'],
  ['qwen2.5:7b', 'Qwen 2.5 7B', 7.0, 86, 'coding, chat'],
  ['qwen2.5:7b-instruct', 'Qwen 2.5 7B Instruct', 7.0, 86, 'chat'],
  ['qwen2.5-coder:7b', 'Qwen 2.5 Coder 7B', 7.0, 87, 'coding'],
  ['qwen2.5-coder:1.5b', 'Qwen 2.5 Coder 1.5B', 1.5, 74, 'code small'],
  ['deepseek-r1:7b', 'DeepSeek R1 7B', 7.0, 85, 'reasoning'],
  ['deepseek-r1:8b', 'DeepSeek R1 8B', 8.0, 86, 'reasoning'],
  ['deepseek-coder:6.7b', 'DeepSeek Coder 6.7B', 6.7, 84, 'coding'],
  ['deepseek-coder-v2:16b', 'DeepSeek Coder v2 16B', 16, 89, 'coding large'],
  ['codellama:7b', 'Code Llama 7B', 7.0, 83, 'coding'],
  ['codellama:13b', 'Code Llama 13B', 13, 86, 'coding'],
  ['codellama:34b', 'Code Llama 34B', 34, 90, 'coding frontier'],
  ['neural-chat:7b', 'Neural Chat 7B', 7.0, 79, 'chat'],
  ['starling-lm:7b', 'Starling 7B', 7.0, 81, 'chat'],
  ['openchat:7b', 'OpenChat 7B', 7.0, 80, 'chat'],
  ['vicuna:7b', 'Vicuna 7B', 7.0, 78, 'chat'],
  ['wizardlm2:7b', 'WizardLM2 7B', 7.0, 80, 'instructions'],
  ['wizardlm2:8x22b', 'WizardLM2 8x22B MoE', 141, 94, 'MoE frontier'],
  ['nous-hermes2:7b', 'Nous Hermes 2 7B', 7.0, 81, 'chat'],
  ['nous-hermes2-mixtral:8x7b', 'Nous Hermes Mixtral', 47, 90, 'MoE chat'],
  ['dolphin-mistral:7b', 'Dolphin Mistral 7B', 7.0, 79, 'uncensored chat'],
  ['dolphin-llama3:8b', 'Dolphin Llama 3 8B', 8.0, 80, 'uncensored chat'],
  ['solar:10.7b', 'Solar 10.7B', 10.7, 84, 'depth-upscaled'],
  ['yi:6b', 'Yi 6B', 6.0, 80, 'bilingual'],
  ['yi:9b', 'Yi 9B', 9.0, 83, 'bilingual quality'],
  ['command-r7b', 'Command R 7B', 7.0, 82, 'RAG, tools'],
  ['command-r:35b', 'Command R 35B', 35, 91, 'RAG enterprise'],
  ['command-r-plus:104b', 'Command R+ 104B', 104, 95, 'frontier RAG'],
  ['granite3.1-dense:8b', 'Granite 3.1 8B', 8.0, 84, 'enterprise'],
  ['granite3.1-moe:1b', 'Granite 3.1 MoE 1B', 1.0, 70, 'efficient MoE'],
  ['falcon:7b', 'Falcon 7B', 7.0, 77, 'general'],
  ['falcon2:11b', 'Falcon 2 11B', 11, 82, 'general'],
  ['zephyr:7b', 'Zephyr 7B', 7.0, 80, 'helpful chat'],
  ['orca2:7b', 'Orca 2 7B', 7.0, 79, 'reasoning'],
  ['orca2:13b', 'Orca 2 13B', 13, 84, 'reasoning'],
  ['wizard-vicuna-uncensored:7b', 'Wizard Vicuna 7B', 7.0, 76, 'uncensored'],
  ['everythinglm:13b', 'EverythingLM 13B', 13, 78, 'roleplay'],
  ['megadolphin:7b', 'MegaDolphin 7B', 7.0, 77, 'uncensored'],
  ['open-orca-platypus2:13b', 'OpenOrca Platypus2 13B', 13, 80, 'reasoning'],
  ['stable-beluga:7b', 'Stable Beluga 7B', 7.0, 78, 'chat'],
  ['stable-beluga:13b', 'Stable Beluga 13B', 13, 81, 'chat'],
  ['meditron:7b', 'Meditron 7B', 7.0, 76, 'medical'],
  ['medllama2:7b', 'MedLlama2 7B', 7.0, 75, 'medical'],
  ['biomistral:7b', 'BioMistral 7B', 7.0, 77, 'biomedical'],
  ['llama2:7b', 'Llama 2 7B', 7.0, 72, 'legacy general'],
  ['llama2:13b', 'Llama 2 13B', 13, 78, 'legacy general'],
  ['llama2:70b', 'Llama 2 70B', 70, 90, 'legacy frontier'],
  ['llama2-chinese:7b', 'Llama 2 Chinese 7B', 7.0, 74, 'chinese'],
  ['gemma:7b', 'Gemma 7B', 7.0, 79, 'google chat'],
  ['gemma2:9b', 'Gemma 2 9B', 9.0, 84, 'quality chat'],
  ['gemma2:27b', 'Gemma 2 27B', 27, 91, 'frontier chat'],
  ['gemma3:12b', 'Gemma 3 12B', 12, 87, 'multimodal text'],
  ['gemma3:27b', 'Gemma 3 27B', 27, 92, 'frontier'],
  ['phi4:14b', 'Phi-4 14B', 14, 88, 'reasoning'],
  ['marco-o1:7b', 'Marco-o1 7B', 7.0, 82, 'reasoning'],
  ['reflection:70b', 'Reflection 70B', 70, 92, 'self-correct'],
  ['athene-v2:72b', 'Athene v2 72B', 72, 93, 'agentic'],
  ['sailor2:8b', 'Sailor2 8B', 8.0, 81, 'multilingual sea'],
  ['exaone3.5:7.8b', 'EXAONE 3.5 7.8B', 7.8, 83, 'korean, english'],
  ['aya:23-8b', 'Aya 23 8B', 8.0, 82, 'multilingual'],
  ['aya:23-35b', 'Aya 23 35B', 35, 90, 'multilingual large'],
  ['nemotron-mini:4b', 'Nemotron Mini 4B', 4.0, 76, 'nvidia small'],
  ['nemotron:70b', 'Nemotron 70B', 70, 92, 'nvidia frontier'],
  ['snowflake-arctic-embed:335m', 'Snowflake Arctic Embed', 0.335, 58, 'embeddings', 'embed'],
  ['nomic-embed-text', 'Nomic Embed Text', 0.14, 60, 'embeddings', 'embed'],
  ['mxbai-embed-large', 'MxBai Embed Large', 0.34, 62, 'embeddings', 'embed'],
  ['bge-large', 'BGE Large', 0.34, 61, 'embeddings', 'embed'],
  ['all-minilm', 'All-MiniLM', 0.08, 55, 'embeddings', 'embed'],

  // ── 13–14B ──
  ['qwen2.5:14b', 'Qwen 2.5 14B', 14, 88, 'reasoning'],
  ['qwen2.5:14b-instruct', 'Qwen 2.5 14B Instruct', 14, 88, 'chat'],
  ['qwen2.5:32b', 'Qwen 2.5 32B', 32, 90, 'frontier local'],
  ['qwen2.5:72b', 'Qwen 2.5 72B', 72, 94, 'frontier'],
  ['llama3.1:70b', 'Llama 3.1 70B', 70, 92, 'frontier'],
  ['llama3.1:70b-instruct-q4_K_M', 'Llama 3.1 70B Q4', 70, 92, 'frontier'],
  ['mixtral:8x7b', 'Mixtral 8x7B MoE', 47, 91, 'MoE quality'],
  ['mixtral:8x22b', 'Mixtral 8x22B MoE', 141, 95, 'MoE frontier'],
  ['solar-pro:22b', 'Solar Pro 22B', 22, 89, 'reasoning'],
  ['dbrx:132b', 'DBRX 132B MoE', 132, 96, 'enterprise MoE'],
  ['internlm2:7b', 'InternLM2 7B', 7.0, 82, 'multilingual'],
  ['internlm2:20b', 'InternLM2 20B', 20, 88, 'multilingual large'],
  ['wizardlm:13b', 'WizardLM 13B', 13, 80, 'instructions'],
  ['nous-hermes2:10.7b', 'Nous Hermes 10.7B', 10.7, 83, 'chat'],
  ['starcoder2:7b', 'StarCoder2 7B', 7.0, 82, 'code'],
  ['starcoder2:15b', 'StarCoder2 15B', 15, 86, 'code large'],
  ['shieldgemma:9b', 'ShieldGemma 9B', 9.0, 78, 'safety'],
  ['mathstral:7b', 'Mathstral 7B', 7.0, 84, 'math'],
  ['llama3-groq-tool-use:8b', 'Llama 3 Groq Tool Use 8B', 8.0, 85, 'tool calling'],
  ['firefunction-v2:70b', 'Firefunction v2 70B', 70, 91, 'function calling'],
  ['granite3-moe:3b', 'Granite 3 MoE 3B', 3.0, 77, 'efficient MoE'],
  ['granite-code:8b', 'Granite Code 8B', 8.0, 84, 'code enterprise'],
  ['stable-code:3b', 'Stable Code 3B', 3.0, 73, 'code'],
  ['stablelm2:12b', 'StableLM2 12B', 12, 82, 'chat'],
  ['mpt:7b', 'MPT 7B', 7.0, 74, 'legacy chat'],
  ['mpt:30b', 'MPT 30B', 30, 86, 'legacy large'],
  ['yarn-mistral:7b-128k', 'Yarn Mistral 7B 128k', 7.0, 81, 'long context'],
  ['llama-pro:8b', 'Llama Pro 8B', 8.0, 83, 'block expansion'],
  ['openhermes:7b-mistral-v2.5', 'OpenHermes 7B v2.5', 7.0, 80, 'chat'],
  ['nous-capybara:7b', 'Nous Capybara 7B', 7.0, 79, 'chat'],
  ['neural-chat:7b-v3-3', 'Neural Chat 7B v3.3', 7.0, 80, 'chat'],
  ['wizard-math:7b', 'WizardMath 7B', 7.0, 82, 'math'],
  ['wizard-math:13b', 'WizardMath 13B', 13, 85, 'math'],
  ['deepseek-llm:7b', 'DeepSeek LLM 7B', 7.0, 81, 'general'],
  ['deepseek-llm:67b', 'DeepSeek LLM 67B', 67, 91, 'frontier'],
  ['qwen:7b', 'Qwen 7B', 7.0, 78, 'legacy chat'],
  ['qwen:14b', 'Qwen 14B', 14, 84, 'legacy chat'],
  ['qwen:72b', 'Qwen 72B', 72, 92, 'legacy frontier'],
  ['qwen2:7b', 'Qwen 2 7B', 7.0, 82, 'chat'],
  ['qwen2:72b', 'Qwen 2 72B', 72, 93, 'frontier'],
];

const VERIFIED = new Set([
  // Gateway MODEL_CATALOG (Ollama)
  'smollm2:135m', 'smollm2:360m', 'qwen2.5:0.5b', 'qwen2.5:1.5b', 'gemma3:1b',
  'deepseek-r1:1.5b', 'llama3.2:1b', 'gemma2:2b', 'smollm2:1.7b', 'qwen2.5:3b',
  'llama3.2:3b', 'phi3.5:latest', 'gemma3:4b',
  // Common Ollama library tags
  'mistral:7b', 'llama3.1:8b', 'qwen2.5:7b', 'qwen2.5-coder:7b', 'deepseek-r1:7b',
  'codellama:7b', 'llama3.3:70b', 'qwen2.5:14b', 'gemma2:9b', 'phi3:mini',
  'tinyllama', 'llama2:7b', 'neural-chat:7b', 'zephyr:7b', 'mistral-nemo:12b',
  // Small coding models so low-RAM / CPU machines get a coding pick
  'qwen2.5-coder:1.5b', 'deepseek-coder:1.3b',
]);

function estimateRamGb(paramsB) {
  // Conservative for Ollama on CPU — underestimating causes segfaults on small VMs
  const overhead =
    paramsB < 1 ? 0.55 : paramsB < 2 ? 1.0 : paramsB < 4 ? 1.5 : paramsB < 10 ? 2.2 : paramsB < 30 ? 3.5 : 5.5;
  return Math.round((paramsB * 0.72 + overhead) * 10) / 10;
}

function estimateSizeMb(paramsB) {
  return Math.round(paramsB * 520 + (paramsB < 1 ? 120 : 200));
}

function categorize(useCase, kind) {
  const u = useCase.toLowerCase();
  const cats = new Set();

  if (kind === 'embed') {
    cats.add('research');
    return [...cats];
  }

  if (/code|coding|sql|completion/.test(u)) cats.add('coding');
  if (/vision|multimodal|moondream|llava/.test(u)) cats.add('image');
  if (/rag|research|reasoning|math|tool|agent|biomedical|medical/.test(u)) cats.add('research');
  if (/chat|general|instruction|helpful|teaching|bilingual|multilingual|enterprise|roleplay/.test(u)) {
    cats.add('chat');
  }
  if (/chat|general|instruction|helpful|writing/.test(u)) cats.add('writing');
  if (/rag|long context/.test(u)) cats.add('pdfs');

  if (cats.size === 0) cats.add('chat');
  return [...cats];
}

const models = SEEDS.map(([id, name, paramsB, quality, useCase, kind]) => {
  const entry = {
    id,
    name,
    ramGb: estimateRamGb(paramsB),
    sizeMb: estimateSizeMb(paramsB),
    quality,
    useCase,
    categories: categorize(useCase, kind),
  };
  if (kind) entry.kind = kind;
  if (VERIFIED.has(id)) entry.verified = true;
  return entry;
});

// Deduplicate by id
const seen = new Set();
const unique = models.filter((m) => {
  if (seen.has(m.id)) return false;
  seen.add(m.id);
  return true;
});

const outPath = path.join(__dirname, '..', 'data', 'models.json');
fs.writeFileSync(outPath, JSON.stringify(unique, null, 2) + '\n', 'utf8');
console.log(`Wrote ${unique.length} models to ${outPath}`);
