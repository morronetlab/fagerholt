/** Stable, separate completion state for each grade and ISO school week. */
export function homeworkStorageKey(year, week, grade) {
  return `skolesekken.homework.v1.${year}.${week}.${grade}`;
}

/** Stable across display-order changes. Distinguishes different tasks in the same subject. */
export function homeworkItemKey(item) {
  const normalize = value => String(value ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('nb-NO');
  return `${normalize(item?.subject)}\u241f${normalize(item?.detail)}`;
}
