export type DuplicateValueStrategy = "last" | "first" | "array" | "error";

export type DuplicateValue<TValue, TStrategy extends DuplicateValueStrategy> =
  TStrategy extends "array" ? TValue[] : TValue;

export const applyDuplicateValue = <TValue>(
  current: TValue | TValue[] | undefined,
  value: TValue,
  strategy: DuplicateValueStrategy,
  fieldName: string,
): TValue | TValue[] => {
  if (strategy === "array") {
    return current === undefined
      ? [value]
      : Array.isArray(current)
        ? [...current, value]
        : [current, value];
  }

  if (current === undefined || strategy === "last") {
    return value;
  }

  if (strategy === "first") {
    return current;
  }

  throw new Error(`Duplicate value for "${fieldName}".`);
};
