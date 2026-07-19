import { describe, expect, it } from 'vitest';
import { createThinkStripper, stripThinking } from '../stripThinking';

describe('stripThinking', () => {
  it('removes a closed think block', () => {
    expect(stripThinking('<think>\nsecret\n</think>\n\nHello!')).toBe('Hello!');
  });

  it('removes thinking variant tags', () => {
    expect(stripThinking('<thinking>plan</thinking>Done.')).toBe('Done.');
  });

  it('removes unclosed trailing think blocks', () => {
    expect(stripThinking('Hi<think>\nstill thinking')).toBe('Hi');
  });

  it('passes through normal text', () => {
    expect(stripThinking('Just a hello')).toBe('Just a hello');
  });
});

describe('createThinkStripper', () => {
  it('strips across chunk boundaries', () => {
    const s = createThinkStripper();
    let out = '';
    out += s.push('<thi');
    out += s.push('nk>\nhidden\n</th');
    out += s.push('ink>\nVisible');
    out += s.flush();
    expect(out.replace(/^\s+/, '')).toBe('Visible');
  });
});
