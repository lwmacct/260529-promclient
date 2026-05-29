import type { PromErrorResponse } from "./types";

export class PromClientError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PromClientError";
  }
}

export class PromHttpError extends PromClientError {
  readonly status: number;
  readonly statusText: string;
  readonly url: string;

  constructor(response: Response, url: string) {
    super(`Prometheus HTTP error ${response.status}: ${response.statusText}`);
    this.name = "PromHttpError";
    this.status = response.status;
    this.statusText = response.statusText;
    this.url = url;
  }
}

export class PromApiError extends PromClientError {
  readonly errorType?: string;
  readonly response: PromErrorResponse;

  constructor(response: PromErrorResponse) {
    super(`Prometheus API error: ${response.error ?? "unknown error"}`);
    this.name = "PromApiError";
    this.errorType = response.errorType;
    this.response = response;
  }
}

export class PromParseError extends PromClientError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PromParseError";
  }
}
