import { describe, expect, it } from 'vitest';
import {
  chordTokenAt,
  chordTokens,
  chordsInText,
  insertChordAt,
  insertEmptyBrackets,
  moveTokenAt,
  nextTokenCaret,
  transposeTokenAt,
} from './chordproEdit';

describe('chordTokens', () => {
  it('finds every bracketed token with its span', () => {
    expect(chordTokens('[G]Amazing [C]grace')).toEqual([
      { start: 0, end: 3, inner: 'G' },
      { start: 11, end: 14, inner: 'C' },
    ]);
  });

  it('does not run a token across a line break', () => {
    expect(chordTokens('[G\nC]')).toEqual([]);
  });
});

describe('chordTokenAt', () => {
  const text = '[G]Amazing [C]grace';
  it('finds the token the caret sits inside', () => {
    expect(chordTokenAt(text, 2)?.inner).toBe('G');
  });
  it('falls back to the nearest token before the caret on the same line', () => {
    expect(chordTokenAt(text, 8)?.inner).toBe('G');
    expect(chordTokenAt(text, 17)?.inner).toBe('C');
  });
  it('does not reach back to a previous line', () => {
    expect(chordTokenAt('[G]one\ntwo', 9)).toBeNull();
  });
  it('returns null when there is no chord at all', () => {
    expect(chordTokenAt('just words', 4)).toBeNull();
  });
});

describe('transposeTokenAt', () => {
  it('transposes the chord at the caret', () => {
    expect(transposeTokenAt('[G]Amazing', 5, 2)?.text).toBe('[A]Amazing');
    expect(transposeTokenAt('[G]Amazing', 5, -1)?.text).toBe('[F#]Amazing');
  });

  it('respects the flat preference', () => {
    expect(transposeTokenAt('[G]x', 2, -1, true)?.text).toBe('[Gb]x');
  });

  it('keeps the @beat suffix intact', () => {
    expect(transposeTokenAt('[Am@3/2]x', 3, 2)?.text).toBe('[Bm@3/2]x');
  });

  it('leaves the caret at the end of the rewritten token', () => {
    const out = transposeTokenAt('[G]Amazing', 5, 1);
    expect(out?.caret).toBe(4); // "[G#]" is 4 chars
  });

  it('leaves non-chord annotations alone', () => {
    expect(transposeTokenAt('[N.C.]x', 3, 1)).toBeNull();
    expect(transposeTokenAt('no chords here', 4, 1)).toBeNull();
  });
});

describe('moveTokenAt', () => {
  it('slides a chord one character later', () => {
    expect(moveTokenAt('[G]Amazing', 1, 1)?.text).toBe('A[G]mazing');
  });

  it('slides a chord one character earlier', () => {
    expect(moveTokenAt('Am[G]azing', 3, -1)?.text).toBe('A[G]mazing');
  });

  it('keeps the caret inside the moved token', () => {
    const out = moveTokenAt('[G]Amazing', 1, 1);
    expect(out?.caret).toBe(4);
    expect(out?.text.slice(1, 4)).toBe('[G]');
  });

  it('refuses to cross a line break', () => {
    expect(moveTokenAt('one\n[G]two', 6, -1)).toBeNull();
    expect(moveTokenAt('one[G]\ntwo', 4, 1)).toBeNull();
  });

  it('refuses to move off the start or end of the text', () => {
    expect(moveTokenAt('[G]', 1, -1)).toBeNull();
    expect(moveTokenAt('[G]', 1, 1)).toBeNull();
  });

  it('refuses to hop over an adjacent token', () => {
    expect(moveTokenAt('[G][C]x', 1, 1)).toBeNull();
    expect(moveTokenAt('[G][C]x', 4, -1)).toBeNull();
  });

  it('is reversible', () => {
    const right = moveTokenAt('[G]Amazing', 1, 1);
    expect(moveTokenAt(right!.text, right!.caret - 1, -1)?.text).toBe('[G]Amazing');
  });
});

describe('nextTokenCaret', () => {
  const text = '[G]Amazing [C]grace [D]how';
  it('hops forward to just inside the next token', () => {
    expect(nextTokenCaret(text, 0)).toBe(1);
    expect(nextTokenCaret(text, 1)).toBe(12);
    expect(nextTokenCaret(text, 12)).toBe(21);
  });
  it('hops backward', () => {
    expect(nextTokenCaret(text, 21, -1)).toBe(12);
    expect(nextTokenCaret(text, 12, -1)).toBe(1);
  });
  it('returns null at the ends', () => {
    expect(nextTokenCaret(text, 21)).toBeNull();
    expect(nextTokenCaret(text, 1, -1)).toBeNull();
  });
});

describe('insertChordAt', () => {
  it('inserts a bracketed chord at the caret', () => {
    expect(insertChordAt('Amazing grace', 8, 'C')).toEqual({
      text: 'Amazing [C]grace',
      caret: 11,
    });
  });

  it('replaces the chord the caret is already inside', () => {
    expect(insertChordAt('[G]Amazing', 2, 'Am').text).toBe('[Am]Amazing');
  });

  it('keeps an existing @beat when replacing', () => {
    expect(insertChordAt('[G@2]x', 2, 'Am').text).toBe('[Am@2]x');
  });

  it('ignores an empty symbol', () => {
    expect(insertChordAt('Amazing', 3, '  ')).toEqual({ text: 'Amazing', caret: 3 });
  });
});

describe('insertEmptyBrackets', () => {
  it('leaves the caret between the brackets', () => {
    const out = insertEmptyBrackets('Amazing', 3);
    expect(out.text).toBe('Ama[]zing');
    expect(out.caret).toBe(4);
  });
});

describe('chordsInText', () => {
  it('lists distinct symbols in first-appearance order, ignoring beats', () => {
    expect(chordsInText('[G]a [C@2]b [G]c [Am]d [@4]e')).toEqual(['G', 'C', 'Am']);
  });
});
