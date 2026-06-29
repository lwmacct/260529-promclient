import type {
  PromInstantData,
  PromScalarData,
  PromStringData,
  PromSuccessResponse,
  PromVectorData,
  PromVectorItem,
} from "../model/index.js";
import {
  applyDuplicateValue,
  type DuplicateValue,
  type DuplicateValueStrategy,
} from "./duplicate.js";
import { isScalarData, isStringData, isVectorData } from "./guards.js";
import { safeParseFloat } from "./numeric.js";

export type LabelMapOptions<TStrategy extends DuplicateValueStrategy = "last"> =
  {
    duplicate?: TStrategy;
  };

export const getVectorItems = (
  response: PromSuccessResponse<PromInstantData>,
): PromVectorItem[] => {
  if (!isVectorData(response.data)) {
    return [];
  }
  return response.data.result;
};

export const getScalarValue = (
  response: PromSuccessResponse<PromInstantData>,
): string | undefined => {
  if (!isScalarData(response.data) && !isStringData(response.data)) {
    return undefined;
  }
  return response.data.result[1];
};

export const getScalarNumber = (
  response: PromSuccessResponse<PromScalarData | PromStringData>,
  defaultValue = Number.NaN,
): number => {
  const value = getScalarValue(response);
  return value === undefined
    ? defaultValue
    : safeParseFloat(value, defaultValue);
};

export const mapVectorByLabel = <
  TStrategy extends DuplicateValueStrategy = "last",
>(
  response: PromSuccessResponse<PromVectorData>,
  labelName: string,
  parser: (value: string) => number = (value) => safeParseFloat(value),
  options: LabelMapOptions<TStrategy> = {},
): Record<string, DuplicateValue<number, TStrategy>> => {
  const duplicate = options.duplicate ?? "last";
  const result: Record<string, number | number[]> = {};

  for (const item of response.data.result) {
    const labelValue = item.metric[labelName];
    if (labelValue === undefined) {
      continue;
    }

    const value = parser(item.value[1]);
    if (Number.isNaN(value)) {
      continue;
    }

    result[labelValue] = applyDuplicateValue(
      result[labelValue],
      value,
      duplicate,
      labelValue,
    ) as number | number[];
  }

  return result as Record<string, DuplicateValue<number, TStrategy>>;
};

export const mapVector = <TValue>(
  response: PromSuccessResponse<PromVectorData>,
  mapper: (item: PromVectorItem) => TValue | undefined,
): TValue[] => {
  const result: TValue[] = [];
  for (const item of response.data.result) {
    const mapped = mapper(item);
    if (mapped !== undefined) {
      result.push(mapped);
    }
  }
  return result;
};
