export const safeParseFloat = (
  value: string | number,
  defaultValue = Number.NaN,
): number => {
  const parsed = Number.parseFloat(String(value));
  return Number.isNaN(parsed) ? defaultValue : parsed;
};

export const toMilliseconds = (timestampSeconds: number): number =>
  timestampSeconds * 1000;
