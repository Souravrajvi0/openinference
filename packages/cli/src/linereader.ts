import readline from 'node:readline';

export type Suggestion = {
  value: string;
  label: string;
  hint?: string;
  /** When true, accepting this item (Enter) runs it immediately; otherwise it
   *  just fills the buffer so the user can continue (e.g. add an argument). */
  submit?: boolean;
};

export type ReaderConfig = {
  /** Colored prompt string (may contain ANSI). */
  prompt: string;
  /** Visible width of the prompt (excluding ANSI codes). */
  promptWidth: number;
  /** Live suggestions for the current buffer; empty array hides the menu. */
  suggest: (buffer: string) => Suggestion[];
  /** Command history, oldest first. */
  history: string[];
  /** Max menu rows to show. */
  maxRows?: number;
  /** Colored in-box marker (may contain ANSI). Defaults to "›". */
  marker?: string;
  /** Visible width of the marker (excluding ANSI codes). Defaults to 1. */
  markerWidth?: number;
};

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const TEAL = '\x1b[38;5;43m';
const ANSI_RE = /\x1b\[[0-9;]*m/g;

/** Visible character count after stripping ANSI SGR codes. */
function visibleLen(s: string): number {
  return s.replace(ANSI_RE, '').length;
}

/** Truncate a plain (ANSI-free) string so it never wraps the terminal. */
function clamp(s: string, max: number): string {
  if (max <= 1) return '';
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** Lay out a list row "<indent><marker> <label>  <hint>" within `cols`. */
function listRow(marker: string, label: string, hint: string | undefined, cols: number, on: boolean): string {
  const avail = Math.max(12, cols - 6); // 3 indent + marker + 2 spacing
  let lab = clamp(label, avail);
  let h = '';
  const rest = avail - lab.length - 2;
  if (hint && rest > 1) h = clamp(hint, rest);
  const mark = on ? `${TEAL}${marker}${RESET}` : ' ';
  const labCol = on ? `${TEAL}${lab}${RESET}` : `${DIM}${lab}${RESET}`;
  const hintCol = h ? `  ${DIM}${h}${RESET}` : '';
  return `   ${mark} ${labCol}${hintCol}`;
}

/**
 * A minimal line editor with a live drop-down suggestion menu (Claude-Code
 * style). Supports inline editing (←/→/Home/End/Backspace), history (↑/↓ when
 * the menu is closed), and Tab/Enter to accept a suggestion.
 *
 * Falls back to plain readline when stdin is not a TTY or OI_SIMPLE is set.
 */
export class LineReader {
  private buf = '';
  private cursor = 0;
  private menu: Suggestion[] = [];
  private sel = 0;
  private histIdx: number;
  private prevTop = 0; // rows from top of block to terminal cursor at last render
  private onKey?: (str: string, key: KeyInfo) => void;
  private resolve?: (v: string | null) => void;

  constructor(private cfg: ReaderConfig) {
    this.histIdx = cfg.history.length;
  }

  private get cols(): number {
    return process.stdout.columns || 80;
  }

  private get maxRows(): number {
    return this.cfg.maxRows ?? 8;
  }

  private get marker(): string {
    return this.cfg.marker ?? `${TEAL}›${RESET}`;
  }

  /** Visible width of " <marker> " inside the box (derived from marker, not config). */
  private get prefixW(): number {
    return visibleLen(this.marker) + 2;
  }

  question(): Promise<string | null> {
    const stdin = process.stdin;
    const simple = process.env.OI_SIMPLE === '1' || !stdin.isTTY;
    if (simple) return this.questionSimple();

    return new Promise<string | null>((resolve) => {
      this.resolve = resolve;
      this.buf = '';
      this.cursor = 0;
      this.histIdx = this.cfg.history.length;
      this.menu = this.cfg.suggest('');
      this.sel = 0;
      this.prevTop = 0;

      readline.emitKeypressEvents(stdin);
      stdin.setRawMode(true);
      stdin.resume();

      this.onKey = (str, key) => this.handleKey(str, key);
      stdin.on('keypress', this.onKey);

      this.render(true);
    });
  }

  /** Fallback: plain readline question (pipes, non-TTY, OI_SIMPLE). */
  private questionSimple(): Promise<string | null> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(this.cfg.prompt, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }

  private cleanup(): void {
    const stdin = process.stdin;
    if (this.onKey) stdin.removeListener('keypress', this.onKey);
    this.onKey = undefined;
    if (stdin.isTTY) stdin.setRawMode(false);
    stdin.pause();
  }

  private commit(): void {
    // Erase the input box + menu, echo the entered line, then drop to a fresh line.
    const out = process.stdout;
    if (this.prevTop > 0) readline.moveCursor(out, 0, -this.prevTop);
    readline.cursorTo(out, 0);
    readline.clearScreenDown(out);
    out.write(`  ${this.marker} ${this.buf}\n`);
    const value = this.buf;
    this.cleanup();
    this.resolve?.(value);
  }

  private handleKey(str: string, key: KeyInfo): void {
    if (!key) return;

    if (key.ctrl && key.name === 'c') {
      process.stdout.write('\n');
      this.cleanup();
      this.resolve?.(null);
      return;
    }
    if (key.ctrl && key.name === 'd' && this.buf === '') {
      process.stdout.write('\n');
      this.cleanup();
      this.resolve?.(null);
      return;
    }

    const menuOpen = this.menu.length > 0;

    switch (key.name) {
      case 'return':
      case 'enter':
        if (menuOpen) {
          const pick = this.menu[this.sel];
          if (pick) {
            this.buf = pick.value;
            this.cursor = this.buf.length;
            if (pick.submit) {
              this.commit();
              return;
            }
            this.refreshMenu();
            break;
          }
        }
        this.commit();
        return;

      case 'tab':
        if (menuOpen) this.accept();
        break;

      case 'escape':
        this.menu = [];
        break;

      case 'up':
        if (menuOpen) this.sel = (this.sel - 1 + this.menu.length) % this.menu.length;
        else this.historyPrev();
        break;

      case 'down':
        if (menuOpen) this.sel = (this.sel + 1) % this.menu.length;
        else this.historyNext();
        break;

      case 'left':
        if (this.cursor > 0) this.cursor--;
        break;

      case 'right':
        if (this.cursor < this.buf.length) this.cursor++;
        break;

      case 'home':
        this.cursor = 0;
        break;

      case 'end':
        this.cursor = this.buf.length;
        break;

      case 'backspace':
        if (this.cursor > 0) {
          this.buf = this.buf.slice(0, this.cursor - 1) + this.buf.slice(this.cursor);
          this.cursor--;
          this.refreshMenu();
        }
        break;

      case 'delete':
        if (this.cursor < this.buf.length) {
          this.buf = this.buf.slice(0, this.cursor) + this.buf.slice(this.cursor + 1);
          this.refreshMenu();
        }
        break;

      default:
        // Printable input (including pasted chunks). Ignore control sequences.
        if (str && !key.ctrl && !key.meta) {
          const clean = str.replace(/[\x00-\x1f\x7f]/g, '');
          if (clean) {
            this.buf = this.buf.slice(0, this.cursor) + clean + this.buf.slice(this.cursor);
            this.cursor += clean.length;
            this.refreshMenu();
          }
        }
        break;
    }

    this.render();
  }

  private refreshMenu(): void {
    this.menu = this.cfg.suggest(this.buf);
    if (this.sel >= this.menu.length) this.sel = 0;
  }

  private accept(): void {
    const pick = this.menu[this.sel];
    if (!pick) return;
    this.buf = pick.value;
    this.cursor = this.buf.length;
    this.refreshMenu();
  }

  private historyPrev(): void {
    const h = this.cfg.history;
    if (this.histIdx > 0) {
      this.histIdx--;
      this.buf = h[this.histIdx] ?? '';
      this.cursor = this.buf.length;
      this.menu = [];
    }
  }

  private historyNext(): void {
    const h = this.cfg.history;
    if (this.histIdx < h.length) {
      this.histIdx++;
      this.buf = this.histIdx === h.length ? '' : h[this.histIdx] ?? '';
      this.cursor = this.buf.length;
      this.menu = [];
    }
  }

  private renderItem(s: Suggestion, i: number): string {
    return listRow('❯', s.label, s.hint, this.cols, i === this.sel);
  }

  /** Box width + the horizontally-scrolled slice of the buffer that is visible. */
  private window(): { boxW: number; text: string; cursorCol: number; prefixW: number } {
    const margin = 1; // leading space before the box
    // Full line is margin + │ + boxW + │ — must fit in cols or the box wraps
    // and the cursor drifts outside the frame.
    const boxW = Math.max(20, Math.min(this.cols - 2 - margin, 100));
    const prefixW = this.prefixW;
    const avail = Math.max(1, boxW - prefixW);

    let off = 0;
    if (this.buf.length > avail) {
      if (this.cursor > avail - 1) off = this.cursor - (avail - 1);
      off = Math.min(off, this.buf.length - avail);
      off = Math.max(0, off);
    }
    const text = this.buf.slice(off, off + avail);
    // margin + │ + " " + marker + " " + typed chars
    const cursorCol = margin + 1 /* │ */ + prefixW + (this.cursor - off);
    return { boxW, text, cursorCol, prefixW };
  }

  private render(first = false): void {
    const out = process.stdout;

    if (!first && this.prevTop > 0) readline.moveCursor(out, 0, -this.prevTop);
    readline.cursorTo(out, 0);
    readline.clearScreenDown(out);

    const { boxW, text, cursorCol, prefixW } = this.window();
    const m = ' '; // margin
    // Interior between the two │ must be exactly boxW (was hardcoded for a
    // 1-char › marker; shell uses "oi ❯" so the old pad overflowed & wrapped).
    const pad = ' '.repeat(Math.max(0, boxW - prefixW - text.length));

    const top = `${m}${DIM}╭${'─'.repeat(boxW)}╮${RESET}`;
    const input = `${m}${DIM}│${RESET} ${this.marker} ${text}${pad}${DIM}│${RESET}`;
    const bottom = `${m}${DIM}╰${'─'.repeat(boxW)}╯${RESET}`;

    out.write(top + '\n');
    out.write(input + '\n');
    out.write(bottom);

    const menu = this.menu.slice(0, this.maxRows);
    if (menu.length) {
      out.write('\n');
      menu.forEach((s, i) => out.write(this.renderItem(s, i) + (i < menu.length - 1 ? '\n' : '')));
    }

    // Move from the last drawn row back up to the input row (row index 1).
    const rowsBelowInput = 1 + menu.length;
    readline.moveCursor(out, 0, -rowsBelowInput);
    readline.cursorTo(out, cursorCol);
    this.prevTop = 1;
  }
}

type KeyInfo = {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  sequence?: string;
};

export type Choice<T> = { value: T; label: string; hint?: string };

export type SelectConfig<T> = {
  title: string;
  choices: Choice<T>[];
  /** Footer hint; defaults to navigation help. */
  hint?: string;
};

/** Default footer for arrow-key lists — always advertise how to leave. */
export const SELECT_HINT = '↑↓ move · Enter select · Esc/Ctrl+C cancel';

/**
 * Arrow-key list selector (↑/↓ to move, Enter to choose, 1-9 as shortcuts,
 * Esc or Ctrl+C to cancel). Falls back to a numbered prompt when stdin is not a TTY
 * or OI_SIMPLE is set. Returns the chosen value, or null if cancelled.
 */
export function select<T>(cfg: SelectConfig<T>): Promise<T | null> {
  const { title, choices } = cfg;
  if (choices.length === 0) return Promise.resolve(null);

  const stdin = process.stdin;
  const simple = process.env.OI_SIMPLE === '1' || !stdin.isTTY;
  if (simple) return selectSimple(cfg);

  return new Promise<T | null>((resolve) => {
    const out = process.stdout;
    let sel = 0;
    const block = 1 + choices.length; // rows from title row to footer row

    const render = (first = false) => {
      const cols = out.columns || 80;
      if (!first) readline.moveCursor(out, 0, -block);
      readline.cursorTo(out, 0);
      readline.clearScreenDown(out);
      out.write(clamp(title, cols - 1) + '\n');
      choices.forEach((c, i) => out.write(listRow('❯', c.label, c.hint, cols, i === sel) + '\n'));
      out.write(`   ${DIM}${clamp(cfg.hint ?? SELECT_HINT, cols - 4)}${RESET}`);
    };

    const cleanup = () => {
      stdin.removeListener('keypress', onKey);
      if (stdin.isTTY) stdin.setRawMode(false);
      out.write('\x1b[?25h'); // show cursor
      stdin.pause();
    };

    const finish = (value: T | null) => {
      readline.moveCursor(out, 0, -block);
      readline.cursorTo(out, 0);
      readline.clearScreenDown(out);
      if (value !== null) {
        const chosen = choices.find((c) => c.value === value);
        out.write(`${title}  ${TEAL}${chosen?.label ?? ''}${RESET}\n`);
      }
      cleanup();
      resolve(value);
    };

    const onKey = (str: string, key: KeyInfo) => {
      if (!key) return;
      if (key.ctrl && key.name === 'c') return finish(null);
      switch (key.name) {
        case 'escape':
          return finish(null);
        case 'up':
          sel = (sel - 1 + choices.length) % choices.length;
          break;
        case 'down':
          sel = (sel + 1) % choices.length;
          break;
        case 'return':
        case 'enter':
          return finish(choices[sel]!.value);
        default:
          if (str && /^[1-9]$/.test(str)) {
            const n = parseInt(str, 10);
            if (n <= choices.length) return finish(choices[n - 1]!.value);
          }
      }
      render();
    };

    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    out.write('\x1b[?25l'); // hide cursor
    stdin.on('keypress', onKey);
    render(true);
  });
}

/**
 * One-shot single-line text prompt using the SAME raw-keypress discipline as
 * `select` / `LineReader`. Returns the typed string, or null on Ctrl+C.
 *
 * This exists so the wizard never mixes `readline.createInterface` with the
 * raw-mode readers on the same stdin — doing so corrupts stdin state and makes
 * the *next* interactive prompt resolve as if cancelled. Falls back to plain
 * readline only when stdin is not a TTY or OI_SIMPLE is set.
 */
export function readLine(promptText: string): Promise<string | null> {
  const stdin = process.stdin;
  const simple = process.env.OI_SIMPLE === '1' || !stdin.isTTY;
  if (simple) {
    return new Promise((resolve) => {
      const rl = readline.createInterface({ input: stdin, output: process.stdout });
      rl.question(promptText, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }

  return new Promise<string | null>((resolve) => {
    const out = process.stdout;
    let buf = '';
    out.write(promptText);

    const cleanup = () => {
      stdin.removeListener('keypress', onKey);
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.pause();
    };

    const onKey = (str: string, key: KeyInfo) => {
      if (!key) return;
      if ((key.ctrl && key.name === 'c') || key.name === 'escape') {
        out.write('\n');
        cleanup();
        return resolve(null);
      }
      if (key.name === 'return' || key.name === 'enter') {
        out.write('\n');
        cleanup();
        return resolve(buf);
      }
      if (key.name === 'backspace') {
        if (buf.length) {
          buf = buf.slice(0, -1);
          out.write('\b \b');
        }
        return;
      }
      if (str && !key.ctrl && !key.meta) {
        const clean = str.replace(/[\x00-\x1f\x7f]/g, '');
        if (clean) {
          buf += clean;
          out.write(clean);
        }
      }
    };

    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('keypress', onKey);
  });
}

function selectSimple<T>(cfg: SelectConfig<T>): Promise<T | null> {
  console.log(cfg.title + '\n');
  cfg.choices.forEach((c, i) =>
    console.log(`  ${i + 1}. ${c.label}${c.hint ? '   ' + c.hint : ''}`),
  );
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise<T | null>((resolve) => {
    rl.question(`\n  Choose (1-${cfg.choices.length}) [1]: `, (ans) => {
      rl.close();
      const n = parseInt(ans.trim() || '1', 10);
      if (!Number.isNaN(n) && n >= 1 && n <= cfg.choices.length) resolve(cfg.choices[n - 1]!.value);
      else resolve(cfg.choices[0]!.value);
    });
  });
}
