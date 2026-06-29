import type { PromVectorItem } from "../../model/index.js";
import { applyDuplicateValue } from "../duplicate.js";
import type {
  DuplicateRecordFieldStrategy,
  PromRecordBaseSchema,
  PromRecordFieldRule,
  PromRecordSchema,
} from "./schema.js";

export const setRecordField = <TRecord extends Record<string, unknown>>(
  record: TRecord,
  field: string,
  value: unknown,
  duplicate: DuplicateRecordFieldStrategy,
) => {
  record[field as keyof TRecord] = applyDuplicateValue(
    record[field] as unknown[] | unknown | undefined,
    value,
    duplicate,
    field,
  ) as TRecord[keyof TRecord];
};

export const applyBase = <TRecord extends Record<string, unknown>>(
  record: TRecord,
  item: PromVectorItem,
  schema?: PromRecordBaseSchema<TRecord>,
) => {
  if (!schema) {
    return;
  }

  for (const [field, resolver] of Object.entries(schema)) {
    if (record[field] !== undefined || !resolver) {
      continue;
    }
    const value = resolver(item);
    if (value !== undefined) {
      record[field as keyof TRecord] = value as TRecord[keyof TRecord];
    }
  }
};

export const getFieldRules = <TRecord extends Record<string, unknown>>(
  rawField: string,
  schema: PromRecordSchema<TRecord>,
): readonly PromRecordFieldRule[] => {
  const rules = schema.fields[rawField];
  if (rules === undefined) {
    if (schema.unknownField === "error") {
      throw new Error(`Unknown record field "${rawField}".`);
    }
    return [];
  }
  return Array.isArray(rules)
    ? (rules as readonly PromRecordFieldRule[])
    : [rules as PromRecordFieldRule];
};
