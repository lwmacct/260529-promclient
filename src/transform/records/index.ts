import { isVectorData } from "../guards.js";
import { applyBase, getFieldRules, setRecordField } from "./apply.js";
import type {
  MergeVectorRecordsInput,
  MergeVectorRecordsOptions,
  PromRecordSchema,
} from "./schema.js";
import type { PromInstantData, PromSuccessResponse } from "../../model/index.js";

export type {
  DuplicateRecordFieldStrategy,
  MergeVectorRecordsInput,
  MergeVectorRecordsOptions,
  PromRecordBaseSchema,
  PromRecordFieldRule,
  PromRecordSchema,
  PromRecordValue,
  PromRecordValueResolver,
} from "./schema.js";

export {
  autoValue,
  constant,
  label,
  labels,
  labelValue,
  metricName,
  numberSample,
  sample,
} from "./resolvers.js";

export const mapVectorToRecordMap = <
  TRecord extends Record<string, unknown>,
>(
  response: PromSuccessResponse<PromInstantData>,
  schema: PromRecordSchema<TRecord>,
): Record<string, TRecord> => {
  if (!isVectorData(response.data)) {
    return {};
  }

  const records: Record<string, TRecord> = {};

  for (const item of response.data.result) {
    const key = schema.key(item);
    const rawField = schema.field(item);
    if (key === undefined || rawField === undefined) {
      continue;
    }

    const rules = getFieldRules(rawField, schema);
    if (rules.length === 0) {
      continue;
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
  }

  return records;
};

export const mapVectorToRecords = <
  TRecord extends Record<string, unknown>,
>(
  response: PromSuccessResponse<PromInstantData>,
  schema: PromRecordSchema<TRecord>,
): TRecord[] => Object.values(mapVectorToRecordMap(response, schema));

export const mergeVectorRecords = <
  TRecord extends Record<string, unknown>,
>(
  inputs: readonly MergeVectorRecordsInput<TRecord>[],
  options: MergeVectorRecordsOptions = {},
): TRecord[] => {
  const duplicate = options.duplicate ?? "last";
  const records: Record<string, TRecord> = {};

  for (const input of inputs) {
    for (const [key, record] of Object.entries(
      mapVectorToRecordMap(input.response, input.schema),
    )) {
      const current = records[key];
      if (current === undefined) {
        records[key] = { ...record };
        continue;
      }

      const merged = current;
      for (const [field, value] of Object.entries(record)) {
        if (Object.is(merged[field], value)) {
          continue;
        }
        setRecordField(merged, field, value, duplicate);
      }
      records[key] = merged;
    }
  }

  return Object.values(records);
};
