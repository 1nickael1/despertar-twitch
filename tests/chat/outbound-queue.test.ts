import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_MESSAGE_LENGTH, OutboundQueue } from '../../src/chat/outbound-queue';

describe('OutboundQueue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('envia a primeira na hora e espaça as próximas', async () => {
    const sent: string[] = [];
    const q = new OutboundQueue(async (t) => void sent.push(t), 1000);
    q.enqueue('a');
    q.enqueue('b');
    q.enqueue('c');
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent).toEqual(['a', 'b']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent).toEqual(['a', 'b', 'c']);
  });

  it('respeita o intervalo para mensagem que chega depois', async () => {
    const sent: string[] = [];
    const q = new OutboundQueue(async (t) => void sent.push(t), 1000);
    q.enqueue('a');
    await vi.advanceTimersByTimeAsync(500);
    q.enqueue('b');
    await vi.advanceTimersByTimeAsync(499);
    expect(sent).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toEqual(['a', 'b']);
  });

  it('corta mensagens longas', async () => {
    const sent: string[] = [];
    const q = new OutboundQueue(async (t) => void sent.push(t), 0);
    q.enqueue('x'.repeat(MAX_MESSAGE_LENGTH + 50));
    await vi.advanceTimersByTimeAsync(0);
    expect(sent[0]).toHaveLength(MAX_MESSAGE_LENGTH);
    expect(sent[0].endsWith('...')).toBe(true);
  });

  it('segue em frente se um envio falhar', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sent: string[] = [];
    const q = new OutboundQueue(async (t) => {
      if (t === 'a') throw new Error('falhou');
      sent.push(t);
    }, 10);
    q.enqueue('a');
    q.enqueue('b');
    await vi.advanceTimersByTimeAsync(20);
    expect(sent).toEqual(['b']);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
