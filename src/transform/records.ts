import type {
  PromInstantData,
  PromLabelSet,
  PromVectorItem,
  PromSuccessResponse,
} from "../types";
import { isVectorData, safeParseFloat, toMilliseconds } from "./core";

export type PromFieldValue = string | number;

export type PromFieldRow = {
  index?: string;
  key: string;
  field: string;
  value: PromFieldValue;
  labels: PromLabelSet;
  sampleValue: string;
  timestampMs: number;
};

export type PromFieldValueSource = "auto" | "label" | "sample";

export type PromFieldMapping =
  | string
  | false
  | {
      as?: string;
      valueLabel?: string;
      valueSource?: PromFieldValueSource;
      sampleParser?: (
        value: string,
        item: PromVectorItem,
      ) => PromFieldValue | undefined;
    };

export type MapVectorToFieldRowsOptions = {
  indexLabels?: readonly string[];
  keyLabels: readonly string[];
  fieldLabels?: readonly string[];
  field?: string;
  valueLabel?: string;
  valueSource?: PromFieldValueSource;
  labelSeparator?: string;
  sampleParser?: (
    value: string,
    item: PromVectorItem,
  ) => PromFieldValue | undefined;
  fieldMappings?: Record<string, PromFieldMapping>;
  unknownField?: "keep" | "drop";
};

export type DuplicateFieldRowStrategy = "last" | "first" | "array" | "error";

export type MapFieldRowsOptions = {
  duplicate?: DuplicateFieldRowStrategy;
};

export type PromFieldRecord = Record<string, PromFieldValue | PromFieldValue[]>;

export type PromFieldTable = Record<string, PromFieldRecord>;

export type PromIndexedFieldTable = Record<string, PromFieldTable>;

const defaultLabelSeparator = ".";
const defaultValueLabel = "value";

const joinLabelValues = (
  labels: PromLabelSet,
  labelNames: readonly string[],
  separator: string,
): string | undefined => {
  const values: string[] = [];
  for (const labelName of labelNames) {
    const value = labels[labelName];
    if (value === undefined) {
      return undefined;
    }
    values.push(value);
  }
  return values.join(separator);
};

const resolveFieldValue = (
  item: PromVectorItem,
  options: Required<
    Pick<
      MapVectorToFieldRowsOptions,
      "sampleParser" | "valueLabel" | "valueSource"
    >
  >,
): PromFieldValue | undefined => {
  const labelValue = item.metric[options.valueLabel];

  if (options.valueSource === "label") {
    return labelValue;
  }

  if (options.valueSource === "auto" && labelValue !== undefined) {
    return labelValue;
  }

  return options.sampleParser(item.value[1], item);
};

const resolveFieldMapping = (
  field: string,
  options: Pick<MapVectorToFieldRowsOptions, "fieldMappings" | "unknownField">,
):
  | {
      field: string;
      valueLabel?: string;
      valueSource?: PromFieldValueSource;
      sampleParser?: (
        value: string,
        item: PromVectorItem,
      ) => PromFieldValue | undefined;
    }
  | undefined => {
  const mapping = options.fieldMappings?.[field];

  if (mapping === undefined) {
    return options.unknownField === "drop" ? undefined : { field };
  }

  if (mapping === false) {
    return undefined;
  }

  if (typeof mapping === "string") {
    return { field: mapping };
  }

  return {
    ...mapping,
    field: mapping.as ?? field,
  };
};

export const mapVectorItemToFieldRow = (
  item: PromVectorItem,
  options: MapVectorToFieldRowsOptions,
): PromFieldRow | undefined => {
  const labelSeparator = options.labelSeparator ?? defaultLabelSeparator;
  const indexLabels = options.indexLabels ?? [];
  const valueOptions: Required<
    Pick<
      MapVectorToFieldRowsOptions,
      "sampleParser" | "valueLabel" | "valueSource"
    >
  > = {
    sampleParser:
      options.sampleParser ??
      ((value: string) => safeParseFloat(value) as PromFieldValue),
    valueLabel: options.valueLabel ?? defaultValueLabel,
    valueSource: options.valueSource ?? "auto",
  };

  const index =
    indexLabels.length > 0
      ? joinLabelValues(item.metric, indexLabels, labelSeparator)
      : undefined;
  if (indexLabels.length > 0 && index === undefined) {
    return undefined;
  }

  const key = joinLabelValues(item.metric, options.keyLabels, labelSeparator);
  const rawField =
    options.field ??
    (options.fieldLabels
      ? joinLabelValues(item.metric, options.fieldLabels, labelSeparator)
      : undefined);

  if (key === undefined || rawField === undefined) {
    return undefined;
  }

  const fieldMapping = resolveFieldMapping(rawField, options);
  if (fieldMapping === undefined) {
    return undefined;
  }

  const fieldValueOptions = {
    ...valueOptions,
    valueLabel: fieldMapping.valueLabel ?? valueOptions.valueLabel,
    valueSource: fieldMapping.valueSource ?? valueOptions.valueSource,
    sampleParser: fieldMapping.sampleParser ?? valueOptions.sampleParser,
  };
  const value = resolveFieldValue(item, fieldValueOptions);

  if (value === undefined) {
    return undefined;
  }

  return {
    index,
    key,
    field: fieldMapping.field,
    value,
    labels: { ...item.metric },
    sampleValue: item.value[1],
    timestampMs: toMilliseconds(item.value[0]),
  };
};

export const mapVectorToFieldRows = (
  response: PromSuccessResponse<PromInstantData>,
  options: MapVectorToFieldRowsOptions,
): PromFieldRow[] => {
  if (!isVectorData(response.data)) {
    return [];
  }

  return response.data.result.reduce<PromFieldRow[]>((rows, item) => {
    const row = mapVectorItemToFieldRow(item, options);
    if (row !== undefined) {
      rows.push(row);
    }
    return rows;
  }, []);
};

const setFieldValue = (
  record: PromFieldRecord,
  field: string,
  value: PromFieldValue,
  duplicate: DuplicateFieldRowStrategy,
) => {
  const current = record[field];
  if (current === undefined) {
    record[field] = value;
    return;
  }

  if (duplicate === "first") {
    return;
  }

  if (duplicate === "last") {
    record[field] = value;
    return;
  }

  if (duplicate === "array") {
    record[field] = Array.isArray(current)
      ? [...current, value]
      : [current, value];
    return;
  }

  throw new Error(`Duplicate field row for field "${field}".`);
};

export const mapFieldRowsByKey = (
  rows: readonly PromFieldRow[],
  options: MapFieldRowsOptions = {},
): PromFieldTable => {
  const duplicate = options.duplicate ?? "last";

  return rows.reduce<PromFieldTable>((table, row) => {
    const record = table[row.key] ?? {};
    setFieldValue(record, row.field, row.value, duplicate);
    table[row.key] = record;
    return table;
  }, {});
};

export const mapFieldRowsByIndexKey = (
  rows: readonly PromFieldRow[],
  options: MapFieldRowsOptions = {},
): PromIndexedFieldTable => {
  const duplicate = options.duplicate ?? "last";

  return rows.reduce<PromIndexedFieldTable>((table, row) => {
    const index = row.index;
    if (index === undefined) {
      return table;
    }

    const records = table[index] ?? {};
    const record = records[row.key] ?? {};
    setFieldValue(record, row.field, row.value, duplicate);
    records[row.key] = record;
    table[index] = records;
    return table;
  }, {});
};
