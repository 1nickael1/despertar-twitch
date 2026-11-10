import { describe, expect, it } from 'vitest';
import { HourlyNotice, nextHourStart } from '../../src/chat/hourly-notice';

// Datas no fuso do computador, como o bot usa: 10/11/2026 às h:m:s.
const at = (h: number, m = 0, s = 0) => new Date(2026, 10, 10, h, m, s).getTime();

describe('aviso de hora em hora', () => {
  it('a próxima virada é a hora cheia seguinte', () => {
    expect(nextHourStart(at(11, 30))).toBe(at(12));
    expect(nextHourStart(at(11))).toBe(at(12));
    expect(nextHourStart(at(23, 59, 59))).toBe(new Date(2026, 10, 11, 0).getTime());
  });

  it('bot ligado no meio da hora espera a próxima virada', () => {
    const notice = new HourlyNotice('oi', at(11, 30));
    expect(notice.poll(at(11, 59, 59))).toBeNull();
    expect(notice.poll(at(12))).toBe('oi');
  });

  it('manda uma vez só por hora e de novo na hora seguinte', () => {
    const notice = new HourlyNotice('oi', at(11, 30));
    expect(notice.poll(at(12, 0, 1))).toBe('oi');
    expect(notice.poll(at(12, 0, 2))).toBeNull();
    expect(notice.poll(at(12, 30))).toBeNull();
    expect(notice.poll(at(13))).toBe('oi');
  });

  it('acordou muito depois da virada: pula aquela hora em vez de mandar atrasado', () => {
    const notice = new HourlyNotice('oi', at(11, 30));
    expect(notice.poll(at(14, 37))).toBeNull();
    expect(notice.poll(at(15))).toBe('oi');
  });

  it('texto vazio desliga o aviso', () => {
    const notice = new HourlyNotice('  ', at(11, 30));
    expect(notice.poll(at(12))).toBeNull();
  });
});
