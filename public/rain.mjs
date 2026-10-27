/** Rainy school-day weather. Never infer rain from a missing forecast. */
export function rainwearExpected(day) {
  if (!day || typeof day !== 'object') return false;
  if (typeof day.rainMm === 'number' && Number.isFinite(day.rainMm) && day.rainMm > 0) return true;
  const code = typeof day.symbol === 'string' ? day.symbol.toLowerCase() : '';
  return /rain|sleet|thunder/.test(code);
}
