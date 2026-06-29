import type {
  PromInstantData,
  PromVectorItem,
  PromSuccessResponse,
} from "../types";
import { isVectorData, safeParseFloat } from "./core";

export type PromRecordValue = string | number | boolean | null;

export type PromRecordValueResolver<TValue = PromRecordValue> = (
  item: PromVectorItem,
) => TValue | undefined;

export type DuplicateRecordFieldStrategy =
  | "last"
  | "first"
  | "array"
  | "error";

export type PromRecordFieldRule = {
  field: string;
  value: PromRecordValueResolver;
  duplicate?: DuplicateRecordFieldStrategy;
};

export type PromRecordBaseSchema<TRecord extends Record<string, unknown>> = {
  [K in keyof TRecord]?: PromRecordValueResolver<TRecord[K]>;
};

export type PromRecordSchema<TRecord extends Record<string, unknown>> = {
  key: PromRecordValueResolver<string>;
  field: PromRecordValueResolver<string>;
  base?: PromRecordBaseSchema<TRecord>;
  fields: Record<string, PromRecordFieldRule | readonly PromRecordFieldRule[]>;
  duplicate?: DuplicateRecordFieldStrategy;
  unknownField?: "drop" | "error";
};

export type MergeVectorRecordsInput<TRecord extends Record<string, unknown>> = {
  response: PromSuccessResponse<PromInstantData>;
  schema: PromRecordSchema<TRecord>;
};

const setRecordField = <TRecord extends Record<string, unknown>>(
  record: TRecord,
  field: string,
  value: PromRecordValue,
  duplicate: DuplicateRecordFieldStrategy,
) => {
  const current = record[field];
  if (current === undefined) {
    record[field as keyof TRecord] = value as TRecord[keyof TRecord];
    return;
  }

  if (duplicate === "first") {
    return;
  }

  if (duplicate === "last") {
    record[field as keyof TRecord] = value as TRecord[keyof TRecord];
    return;
  }

  if (duplicate === "array") {
    record[field as keyof TRecord] = (
      Array.isArray(current) ? [...current, value] : [current, value]
    ) as TRecord[keyof TRecord];
    return;
  }

  throw new Error(`Duplicate record field "${field}".`);
};

const applyBase = <TRecord extends Record<string, unknown>>(
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

const getFieldRules = <TRecord extends Record<string, unknown>>(
  rawField: string,
  schema: PromRecordSchema<TRecord>,
) => {
  const rules = schema.fields[rawField];
  if (rules === undefined) {
    if (schema.unknownField === "error") {
      throw new Error(`Unknown record field "${rawField}".`);
    }
    return [];
  }
  return Array.isArray(rules) ? rules : [rules];
};

export const mapVectorToRecordMap = <TRecord extends Record<string, unknown>>(
  response: PromSuccessResponse<PromInstantData>,
  schema: PromRecordSchema<TRecord>,
): Record<string, TRecord> => {
  if (!isVectorData(response.data)) {
    return {};
  }

  return response.data.result.reduce<Record<string, TRecord>>((records, item) => {
    const key = schema.key(item);
    const rawField = schema.field(item);
    if (key === undefined || rawField === undefined) {
      return records;
    }

    const rules = getFieldRules(rawField, schema);
    if (rules.length === 0) {
      return records;
    }

    const record = records[key] ?? ({} as TRecord);
    applyBase(record, item, schema.base);

    for (const rule of rules) {
      const value = rule.value(item);
      if (value !== undefined) {
        setRecordField(
          record,
          rule.field,
          value,
          rule.duplicate ?? schema.duplicate ?? "last",
        );
      }
    }

    records[key] = record;
    return records;
  }, {});
};

export const mapVectorToRecords = <TRecord extends Record<string, unknown>>(
  response: PromSuccessResponse<PromInstantData>,
  schema: PromRecordSchema<TRecord>,
): TRecord[] => Object.values(mapVectorToRecordMap(response, schema));

export const mergeVectorRecords = <TRecord extends Record<string, unknown>>(
  inputs: readonly MergeVectorRecordsInput<TRecord>[],
): TRecord[] => {
  const records: Record<string, TRecord> = {};

  for (const input of inputs) {
    Object.entries(mapVectorToRecordMap(input.response, input.schema)).forEach(
      ([key, record]) => {
        records[key] = { ...(records[key] ?? {}), ...record };
      },
    );
  }

  return Object.values(records);
};

export const label =
  (name: string): PromRecordValueResolver<string> =>
  (item) =>
    item.metric[name];

export const labels =
  (
    names: readonly string[],
    separator = "\u0000",
  ): PromRecordValueResolver<string> =>
  (item) => {
    const values: string[] = [];
    for (const name of names) {
      const value = item.metric[name];
      if (value === undefined) {
        return undefined;
      }
      values.push(value);
    }
    return values.join(separator);
  };

export const metricName = (): PromRecordValueResolver<string> => (item) =>
  item.metric.__name__;

export const constant =
  <TValue extends PromRecordValue>(
    value: TValue,
  ): PromRecordValueResolver<TValue> =>
  () =>
    value;

export const sample =
  <TRecord extends Record<string, unknown>>(
    field: keyof TRecord | string,
    options: { duplicate?: DuplicateRecordFieldStrategy } = {},
  ): PromRecordFieldRule => ({
    field: String(field),
    value: (item) => item.value[1],
    duplicate: options.duplicate,
  });

export const numberSample =
  <TRecord extends Record<string, unknown>>(
    field: keyof TRecord | string,
    options: {
      duplicate?: DuplicateRecordFieldStrategy;
      defaultValue?: number;
    } = {},
  ): PromRecordFieldRule => ({
    field: String(field),
    value: (item) => {
      const value = safeParseFloat(item.value[1], Number.NaN);
      if (Number.isNaN(value)) {
        return options.defaultValue;
      }
      return value;
    },
    duplicate: options.duplicate,
  });

export const labelValue =
  <TRecord extends Record<string, unknown>>(
    field: keyof TRecord | string,
    labelName: string,
    options: { duplicate?: DuplicateRecordFieldStrategy } = {},
  ): PromRecordFieldRule => ({
    field: String(field),
    value: (item) => item.metric[labelName],
    duplicate: options.duplicate,
  });

export const autoValue =
  <TRecord extends Record<string, unknown>>(
    field: keyof TRecord | string,
    labelName: string,
    options: { duplicate?: DuplicateRecordFieldStrategy } = {},
  ): PromRecordFieldRule => ({
    field: String(field),
    value: (item) => item.metric[labelName] ?? item.value[1],
    duplicate: options.duplicate,
  });
