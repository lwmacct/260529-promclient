import type {
  PromApiResponse,
  PromMatrixData,
  PromMatrixItem,
  PromResultData,
  PromScalarData,
  PromSeriesItem,
  PromStringData,
  PromSuccessResponse,
  PromVectorData,
  PromVectorItem,
} from "../types";

export const isSuccessResponse = <TData extends PromResultData>(
  response: PromApiResponse<TData>,
): response is PromSuccessResponse<TData> => response.status === "success";

export const isVectorData = (data: PromResultData): data is PromVectorData =>
  data.resultType === "vector";

export const isMatrixData = (data: PromResultData): data is PromMatrixData =>
  data.resultType === "matrix";

export const isScalarData = (data: PromResultData): data is PromScalarData =>
  data.resultType === "scalar";

export const isStringData = (data: PromResultData): data is PromStringData =>
  data.resultType === "string";

export const isVectorItem = (item: PromSeriesItem): item is PromVectorItem =>
  "value" in item;

export const isMatrixItem = (item: PromSeriesItem): item is PromMatrixItem =>
  "values" in item;

export const safeParseFloat = (
  value: string | number,
  defaultValue = 0,
): number => {
  const parsed = Number.parseFloat(String(value));
  return Number.isNaN(parsed) ? defaultValue : parsed;
};

export const toMilliseconds = (timestampSeconds: number): number =>
  timestampSeconds * 1000;

export const hasResults = (response: PromSuccessResponse): boolean => {
  const { data } = response;
  if (isVectorData(data) || isMatrixData(data)) {
    return data.result.length > 0;
  }
  return data.result[1] !== "";
};
