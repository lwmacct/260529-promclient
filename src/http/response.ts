import type {
  PromApiResponse,
  PromResultData,
  PromSuccessResponse,
} from "../model/index.js";
import { PromApiError, PromParseError } from "./errors.js";

export const parsePromResponse = async <TData extends PromResultData>(
  response: Response,
): Promise<PromSuccessResponse<TData>> => {
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

  return data;
};
