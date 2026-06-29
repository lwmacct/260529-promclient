import type {
  PromBatchOptions,
  PromBatchRequest,
  PromClientOptions,
  PromInstantData,
  PromMatrixData,
  PromQueryOptions,
  PromRangeQueryOptions,
  PromResultData,
  PromSuccessResponse,
} from "../model/index.js";
import { serializeTime } from "../query/index.js";
import { PromHttpError } from "./errors.js";
import { parsePromResponse } from "./response.js";
import {
  appendDefinedParam,
  defaultMaxGetUrlLength,
  mergeHeaders,
  resolveHeaders,
  trimTrailingSlash,
} from "./request.js";

export class PromClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly headers?: PromClientOptions["headers"];
  private readonly maxGetUrlLength: number;

  constructor(options: PromClientOptions) {
    if (!options.baseUrl) {
      throw new Error("PromClient requires a baseUrl.");
    }

    this.baseUrl = trimTrailingSlash(options.baseUrl);
    this.fetcher = options.fetcher ?? ((...args) => globalThis.fetch(...args));
    this.headers = options.headers;
    this.maxGetUrlLength = options.maxGetUrlLength ?? defaultMaxGetUrlLength;
  }

  async query(
    query: string,
    options: PromQueryOptions = {},
  ): Promise<PromSuccessResponse<PromInstantData>> {
    const params = new URLSearchParams({ query });
    appendDefinedParam(
      params,
      "time",
      options.time === undefined ? undefined : serializeTime(options.time),
    );
    appendDefinedParam(params, "timeout", options.timeout);
    appendDefinedParam(params, "limit", options.limit);

    return this.execute<PromInstantData>("/api/v1/query", params, {
      headers: options.headers,
      signal: options.signal,
    });
  }

  async queryRange(
    query: string,
    options: PromRangeQueryOptions,
  ): Promise<PromSuccessResponse<PromMatrixData>> {
    const params = new URLSearchParams({ query });
    params.set("start", serializeTime(options.start));
    params.set("end", serializeTime(options.end));
    params.set("step", String(options.step));
    appendDefinedParam(params, "timeout", options.timeout);
    appendDefinedParam(params, "limit", options.limit);

    return this.execute<PromMatrixData>("/api/v1/query_range", params, {
      headers: options.headers,
      signal: options.signal,
    });
  }

  async batch(
    requests: readonly PromBatchRequest[],
    options: PromBatchOptions = {},
  ): Promise<Array<PromSuccessResponse<PromResultData>>> {
    const { parallel = true } = options;
    const run = (request: PromBatchRequest) =>
      request.type === "queryRange"
        ? this.queryRange(request.query, request.options)
        : this.query(request.query, request.options);

    if (parallel) {
      return Promise.all(requests.map((request) => run(request)));
    }

    const responses: Array<PromSuccessResponse<PromResultData>> = [];
    for (const request of requests) {
      responses.push(await run(request));
    }
    return responses;
  }

  private buildGetUrl(endpoint: string, params: URLSearchParams): string {
    return `${this.baseUrl}${endpoint}?${params.toString()}`;
  }

  private async execute<TData extends PromResultData>(
    endpoint: string,
    params: URLSearchParams,
    requestOptions: {
      headers?: HeadersInit;
      signal?: AbortSignal;
    },
  ): Promise<PromSuccessResponse<TData>> {
    const baseHeaders = await resolveHeaders(this.headers);
    const url = `${this.baseUrl}${endpoint}`;
    const getUrl = this.buildGetUrl(endpoint, params);
    const useGet = getUrl.length <= this.maxGetUrlLength;
    const headers = mergeHeaders(baseHeaders, requestOptions.headers);
    const requestUrl = useGet ? getUrl : url;

    if (!useGet) {
      headers.set("Content-Type", "application/x-www-form-urlencoded");
    }

    const response = await this.fetcher(requestUrl, {
      method: useGet ? "GET" : "POST",
      headers,
      body: useGet ? undefined : params,
      signal: requestOptions.signal,
    });

    if (!response.ok) {
      throw new PromHttpError(response, requestUrl);
    }

    return parsePromResponse<TData>(response);
  }
}
