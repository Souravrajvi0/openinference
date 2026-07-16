// Claude Code-style live progress line for a chat turn: a spinner with an
// increasing token count, live tok/s, and elapsed time, repainted in place
// (\r + erase-line — one line, no cursor gymnastics). The reply text is
// revealed when generation completes; the exact metrics footer follows.

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export class LiveMeter {
  private tokens = 0;
  private t0 = Date.now();
  private firstAt = 0;
  private frame = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly tty = Boolean(process.stdout.isTTY);

  start(): void {
    if (!this.tty) return;
    this.t0 = Date.now();
    this.paint();
    this.timer = setInterval(() => this.paint(), 120);
  }

  /** Call per streamed chunk (Ollama chunks ≈ tokens; footer shows exact numbers). */
  bump(): void {
    this.tokens += 1;
    if (!this.firstAt) this.firstAt = Date.now();
  }

  private paint(): void {
    const secs = Math.floor((Date.now() - this.t0) / 1000);
    this.frame = (this.frame + 1) % FRAMES.length;
    const spin = FRAMES[this.frame];
    let line: string;
    if (!this.firstAt) {
      line = `${spin} thinking… ${secs}s`;
    } else {
      const gen = (Date.now() - this.firstAt) / 1000;
      const tps = gen > 0.2 ? Math.round(this.tokens / gen) : 0;
      line = `${spin} ${this.tokens} tokens · ${tps} tok/s · ${secs}s`;
    }
    process.stdout.write(`\r\x1b[K  ${DIM}${line}${RESET}`);
  }

  /** Stop and erase the meter line (always call — use finally). */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.tty) process.stdout.write('\r\x1b[K');
  }
}
