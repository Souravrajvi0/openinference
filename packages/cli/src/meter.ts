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
  private onData: ((b: Buffer) => void) | null = null;
  private stdinWasRaw = false;

  start(): void {
    if (!this.tty) return;
    this.t0 = Date.now();

    // Swallow keystrokes while generating so typing can't garble the meter line
    // (raw mode = no terminal echo). Ctrl+C still exits.
    if (process.stdin.isTTY) {
      this.stdinWasRaw = Boolean(process.stdin.isRaw);
      process.stdin.setRawMode(true);
      process.stdin.resume();
      this.onData = (b: Buffer) => {
        if (b.includes(3)) {
          // Ctrl+C — restore the terminal, then exit like a normal interrupt.
          this.stop();
          process.stdout.write('\n');
          process.exit(130);
        }
      };
      process.stdin.on('data', this.onData);
    }

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
    if (this.onData) {
      process.stdin.off('data', this.onData);
      this.onData = null;
      if (process.stdin.isTTY) process.stdin.setRawMode(this.stdinWasRaw);
      // Release stdin so one-shot commands can exit; prompts resume it themselves.
      process.stdin.pause();
    }
    if (this.tty) process.stdout.write('\r\x1b[K');
  }
}
