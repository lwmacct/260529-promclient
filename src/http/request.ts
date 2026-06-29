import type { PromClientOptions } from "../model/index.js";

export const defaultMaxGetUrlLength = 2000;

export const trimTrailingSlash = (value: string): string =>
  value.replace(/\/+$/, "");

export const resolveHeaders = async (
  headers: PromClientOptions["headers"],
): Promise<HeadersInit | undefined> =>
  typeof headers === "function" ? headers() : headers;

export const appendDefinedParam = (
  params: URLSearchParams,
  key: string,
  value: string | number | undefined,
) => {
  if (value !== undefined) {
    params.set(key, String(value));
  }
};

export const mergeHeaders = (
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
