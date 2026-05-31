/** Normalize a tag: trim, collapse whitespace, lowercase. */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Merge a new tag into a list, de-duplicating on the normalized form. */
export function addTag(tags: string[], raw: string): string[] {
  const t = normalizeTag(raw);
  if (!t) return tags;
  if (tags.some((x) => normalizeTag(x) === t)) return tags;
  return [...tags, t];
}

export function removeTag(tags: string[], raw: string): string[] {
  const t = normalizeTag(raw);
  return tags.filter((x) => normalizeTag(x) !== t);
}
