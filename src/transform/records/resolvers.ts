import type {
  PromRecordFieldRule,
  PromRecordValue,
  PromRecordValueResolver,
} from "./schema.js";
import { safeParseFloat } from "../numeric.js";

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
    options: Pick<PromRecordFieldRule, "duplicate"> = {},
  ): PromRecordFieldRule<string> => ({
    field: String(field),
    value: (item) => item.value[1],
    duplicate: options.duplicate,
  });

export const numberSample =
  <TRecord extends Record<string, unknown>>(
    field: keyof TRecord | string,
    options: Pick<PromRecordFieldRule, "duplicate"> & {
      defaultValue?: number;
    } = {},
  ): PromRecordFieldRule<number> => ({
    field: String(field),
    value: (item) => {
      const value = safeParseFloat(item.value[1]);
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
    options: Pick<PromRecordFieldRule, "duplicate"> = {},
  ): PromRecordFieldRule<string> => ({
    field: String(field),
    value: (item) => item.metric[labelName],
    duplicate: options.duplicate,
  });

export const autoValue =
  <TRecord extends Record<string, unknown>>(
    field: keyof TRecord | string,
    labelName: string,
    options: Pick<PromRecordFieldRule, "duplicate"> = {},
  ): PromRecordFieldRule<string> => ({
    field: String(field),
    value: (item) => item.metric[labelName] ?? item.value[1],
    duplicate: options.duplicate,
  });
