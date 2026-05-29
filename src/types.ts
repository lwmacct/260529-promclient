export type PromLabelSet = Record<string, string>;

export type PromSampleValue = [timestamp: number, value: string];

export type PromVectorItem = {
  metric: PromLabelSet;
  value: PromSampleValue;
};

export type PromMatrixItem = {
  metric: PromLabelSet;
  values: PromSampleValue[];
};

export type PromSeriesItem = PromVectorItem | PromMatrixItem;

export type PromResultType = "matrix" | "vector" | "scalar" | "string";

export type PromVectorData = {
  resultType: "vector";
  result: PromVectorItem[];
};

export type PromMatrixData = {
  resultType: "matrix";
  result: PromMatrixItem[];
};

export type PromScalarData = {
  resultType: "scalar";
  result: PromSampleValue;
};

export type PromStringData = {
  resultType: "string";
  result: PromSampleValue;
};

export type PromInstantData = PromVectorData | PromScalarData | PromStringData;

export type PromResultData = PromInstantData | PromMatrixData;

export type PromSuccessResponse<TData extends PromResultData = PromResultData> =
  {
    status: "success";
    data: TData;
    warnings?: string[];
    infos?: string[];
  };

export type PromErrorResponse = {
  status: "error";
  data?: unknown;
  errorType?: string;
  error?: string;
  warnings?: string[];
  infos?: string[];
};

export type PromApiResponse<TData extends PromResultData = PromResultData> =
  | PromSuccessResponse<TData>
  | PromErrorResponse;

export type PromQueryTime = Date | number | string;

export type PromQueryOptions = {
  time?: PromQueryTime;
  timeout?: string;
  limit?: number;
  signal?: AbortSignal;
  headers?: HeadersInit;
};

export type PromRangeQueryOptions = {
  start: PromQueryTime;
  end: PromQueryTime;
  step: string | number;
  timeout?: string;
  limit?: number;
  signal?: AbortSignal;
  headers?: HeadersInit;
};

export type PromBatchQueryRequest = {
  type?: "query";
  query: string;
  options?: PromQueryOptions;
};

export type PromBatchRangeQueryRequest = {
  type: "queryRange";
  query: string;
  options: PromRangeQueryOptions;
};

export type PromBatchRequest =
  | PromBatchQueryRequest
  | PromBatchRangeQueryRequest;

export type PromBatchOptions = {
  parallel?: boolean;
};

export type PromClientOptions = {
  baseUrl: string;
  fetcher?: typeof fetch;
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  maxGetUrlLength?: number;
};
