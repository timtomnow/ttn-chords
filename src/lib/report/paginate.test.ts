import { describe, expect, it } from 'vitest';
import { paginate } from './paginate';

const ids = (s: { ids: string[] }[]) => s.map((x) => x.ids);

describe('paginate', () => {
  it('keeps everything on one sheet when it fits', () => {
    const s = paginate([{ id: 'a', height: 100 }, { id: 'b', height: 100 }], 1000, 10);
    expect(ids(s)).toEqual([['a', 'b']]);
  });

  it('always emits one sheet, even with no blocks', () => {
    expect(paginate([], 1000, 10)).toEqual([{ ids: [], overflowIds: [] }]);
  });

  it('breaks to a new sheet when the next block would overflow', () => {
    const s = paginate(
      [
        { id: 'a', height: 600 },
        { id: 'b', height: 600 },
        { id: 'c', height: 100 },
      ],
      1000,
      10,
    );
    expect(ids(s)).toEqual([['a'], ['b', 'c']]);
  });

  it('accounts for the gap between stacked blocks', () => {
    // 500 + gap 10 + 500 = 1010 > 1000 → second block spills.
    const s = paginate([{ id: 'a', height: 500 }, { id: 'b', height: 500 }], 1000, 10);
    expect(ids(s)).toEqual([['a'], ['b']]);
  });

  it('isolates an oversized block and flags it as overflowing', () => {
    const s = paginate(
      [
        { id: 'a', height: 200 },
        { id: 'big', height: 1500 },
        { id: 'c', height: 200 },
      ],
      1000,
      10,
    );
    expect(ids(s)).toEqual([['a'], ['big'], ['c']]);
    expect(s[1].overflowIds).toEqual(['big']);
  });
});
