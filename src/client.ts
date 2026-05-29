import { PromApiError, PromHttpError, PromParseError } from "./errors";
import { serializeTime } from "./time";
import type {
  PromApiResponse,
  PromBatchOptions,
  PromBatchRequest,
  PromClientOptions,
  PromInstantData,
  PromQueryOptions,
  PromRangeQueryOptions,
  PromMatrixData,
  PromResultData,
  PromSuccessResponse,
} from "./types";

const defaultMaxGetUrlLength = 2000;

const trimSlash = (value: string): string => value.replace(/\/+$/, "");

const resolveHeaders = async (
  headers: PromClientOptions["headers"],
): Promise<HeadersInit | undefined> =>
  typeof headers === "function" ? headers() : headers;

const appendDefinedParam = (
  params: URLSearchParams,
  key: string,
  value: string | number | undefined,
) => {
  if (value !== undefined) {
    params.set(key, String(value));
  }
};

const mergeHeaders = (
  baseHeaders?: HeadersInit,
  requestHeaders?: HeadersInit,
): Headers => {
  const headers = new Headers(baseHeaders);
  if (requestHeaders) {
    new Headers(requestHeaders).forEach((value, key) => {
      headers.set(key, value);
    });
  }
  return headers;
};

export class PromClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly headers?: PromClientOptions["headers"];
  private readonly maxGetUrlLength: number;
  private readonly debug: boolean;
  private readonly logger: Pick<Console, "info">;

  constructor(options: PromClientOptions) {
    if (!options.baseUrl) {
      throw new Error("PromClient requires a baseUrl.");
    }

    this.baseUrl = trimSlash(options.baseUrl);
    this.fetcher = options.fetcher ?? ((...args) => globalThis.fetch(...args));
    this.headers = options.headers;
    this.maxGetUrlLength = options.maxGetUrlLength ?? defaultMaxGetUrlLength;
    this.debug = options.debug ?? false;
    this.logger = options.logger ?? console;
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

  private buildUrl(endpoint: string, params: URLSearchParams): string {
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
    const getUrl = this.buildUrl(endpoint, params);
    const useGet = getUrl.length <= this.maxGetUrlLength;
    const headers = mergeHeaders(baseHeaders, requestOptions.headers);
    const requestUrl = useGet ? getUrl : url;

    let response: Response;
    if (useGet) {
      response = await this.fetcher(requestUrl, {
        method: "GET",
        headers,
        signal: requestOptions.signal,
      });
    } else {
      headers.set("Content-Type", "application/x-www-form-urlencoded");
      response = await this.fetcher(requestUrl, {
        method: "POST",
        headers,
        body: params,
        signal: requestOptions.signal,
      });
    }

    if (!response.ok) {
      throw new PromHttpError(response, requestUrl);
    }

    let data: PromApiResponse<TData>;
    try {
      data = (await response.json()) as PromApiResponse<TData>;
    } catch (error) {
      throw new PromParseError("Failed to parse Prometheus response JSON.", {
        cause: error,
      });
    }

    if (data.status === "error") {
      throw new PromApiError(data);
    }

    if (data.status !== "success") {
      throw new PromParseError("Prometheus response did not include a status.");
    }

    if (this.debug) {
      this.logger.info("PromClient query succeeded", {
        endpoint,
        method: useGet ? "GET" : "POST",
        resultType: data.data.resultType,
      });
    }

    return data;
  }
}
