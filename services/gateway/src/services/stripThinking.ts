/**
 * Reasoning models (Qwen-R1, DeepSeek-R1, etc.) often wrap chain-of-thought in
 * <think>...</think> (or <thinking>). Strip those so clients only see the answer.
 */

const OPEN_RE = /<think(?:ing)?>/i;
const CLOSE_RE = /<\/think(?:ing)?>/i;

/** Remove complete (and trailing unclosed) think blocks from a full string. */
export function stripThinking(content: string): string {
  if (!content || !OPEN_RE.test(content)) return content;
  let out = content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');
  out = out.replace(/<think(?:ing)?>[\s\S]*$/gi, '');
  return out.replace(/^\s*\n+/, '').trimStart();
}

export interface ThinkStripper {
  push(chunk: string): string;
  /** Call at end of stream to emit any held non-think tail. */
  flush(): string;
}

/** Incremental filter for streaming deltas — safe across chunk boundaries. */
export function createThinkStripper(): ThinkStripper {
  let buf = '';
  let inThink = false;
  const HOLD = 14; // enough for a partial "</thinking>"

  return {
    push(chunk: string): string {
      if (!chunk) return '';
      buf += chunk;
      let out = '';

      while (buf.length > 0) {
        if (!inThink) {
          const m = OPEN_RE.exec(buf);
          if (!m || m.index === undefined) {
            if (buf.length > HOLD) {
              out += buf.slice(0, -HOLD);
              buf = buf.slice(-HOLD);
            }
            break;
          }
          out += buf.slice(0, m.index);
          buf = buf.slice(m.index + m[0].length);
          inThink = true;
        } else {
          const m = CLOSE_RE.exec(buf);
          if (!m || m.index === undefined) {
            buf = buf.length > HOLD ? buf.slice(-HOLD) : buf;
            break;
          }
          buf = buf.slice(m.index + m[0].length);
          inThink = false;
        }
      }

      return out;
    },

    flush(): string {
      if (inThink) {
        buf = '';
        inThink = false;
        return '';
      }
      const rest = buf;
      buf = '';
      return rest;
    },
  };
}
