// Pure pagination: pack measured flow blocks into physical sheets.
//
// The report editor and print view both render explicit pages as a stack of
// real sheets (each with correct margins). This decides which blocks land on
// which sheet, respecting block boundaries (a block is never split across a
// sheet — matching print's break-inside-avoid). A block taller than a sheet
// gets its own sheet and is reported as "overflowing" so the UI can offer to
// sever it. Pure + deterministic so it's unit-testable and identical in the
// editor and the print preview.

export type Measured = { id: string; height: number };

export type Sheet = {
  /** Block ids on this sheet, in order. */
  ids: string[];
  /** Ids whose own height exceeds a full sheet (candidates for "sever"). */
  overflowIds: string[];
};

export function paginate(items: Measured[], usable: number, gap: number): Sheet[] {
  const sheets: Sheet[] = [];
  let cur: string[] = [];
  let curOverflow: string[] = [];
  let curH = 0;

  const flush = () => {
    sheets.push({ ids: cur, overflowIds: curOverflow });
    cur = [];
    curOverflow = [];
    curH = 0;
  };

  for (const it of items) {
    const addH = (cur.length ? gap : 0) + it.height;
    // Start a new sheet if this block won't fit on the current (non-empty) one.
    if (cur.length && curH + addH > usable) flush();
    cur.push(it.id);
    curH += (cur.length > 1 ? gap : 0) + it.height;
    if (it.height > usable) curOverflow.push(it.id);
  }
  flush(); // always emit at least one (possibly empty) sheet

  return sheets;
}
