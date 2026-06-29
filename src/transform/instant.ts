import type {
  PromInstantData,
  PromScalarData,
  PromStringData,
  PromSuccessResponse,
  PromVectorData,
  PromVectorItem,
} from "../types";
import {
  isScalarData,
  isStringData,
  isVectorData,
  safeParseFloat,
} from "./core";

export const getVectorItems = (
  response: PromSuccessResponse<PromInstantData>,
): PromVectorItem[] => {
  if (!isVectorData(response.data)) {
    return [];
  }
  return response.data.result;
};

export const getScalarValue = (
  response: PromSuccessResponse<PromScalarData | PromStringData>,
): string | undefined => {
  if (!isScalarData(response.data) && !isStringData(response.data)) {
    return undefined;
  }
  return response.data.result[1];
};

export const getScalarNumber = (
  response: PromSuccessResponse<PromScalarData>,
  defaultValue = Number.NaN,
): number => {
  const value = getScalarValue(response);
  return value === undefined
    ? defaultValue
    : safeParseFloat(value, defaultValue);
};

export const mapVectorByLabel = (
  response: PromSuccessResponse<PromVectorData>,
  labelName: string,
  parser: (value: string) => number = (value) => safeParseFloat(value),
): Record<string, number> => {
  return response.data.result.reduce<Record<string, number>>((result, item) => {
    const labelValue = item.metric[labelName];
    if (!labelValue) {
      return result;
    }
    const value = parser(item.value[1]);
    if (!Number.isNaN(value)) {
      result[labelValue] = value;
    }
    return result;
  }, {});
};

export const mapVector = <T>(
  response: PromSuccessResponse<PromVectorData>,
  mapper: (item: PromVectorItem) => T | undefined,
): T[] =>
  response.data.result.reduce<T[]>((result, item) => {
    const mapped = mapper(item);
    if (mapped !== undefined) {
      result.push(mapped);
    }
    return result;
  }, []);
