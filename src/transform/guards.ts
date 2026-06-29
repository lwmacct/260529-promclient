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
} from "../model/index.js";

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

export const hasResults = (response: PromSuccessResponse): boolean => {
  const { data } = response;
  if (isVectorData(data) || isMatrixData(data)) {
    return data.result.length > 0;
  }
  return data.result[1] !== "";
};
