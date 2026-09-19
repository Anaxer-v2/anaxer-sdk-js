import type { ErrorCodeV1 } from "@anaxer/schemas/public/v1";
import type { RestErrorCodeV1 } from "@anaxer/schemas/public/v1";

/** WS + REST contract codes plus SDK-local codes (doc 22 §4.5). */
export type AnaxerErrorCode =
  | ErrorCodeV1
  | RestErrorCodeV1
  | "connection_closed"
  | "timeout";

export class AnaxerError extends Error {
  readonly code: AnaxerErrorCode;
  readonly status?: number;
  readonly subscriptionId?: string;

  constructor(
    code: AnaxerErrorCode,
    message: string,
    opts?: { status?: number; subscriptionId?: string },
  ) {
    super(message);
    this.name = "AnaxerError";
    this.code = code;
    this.status = opts?.status;
    this.subscriptionId = opts?.subscriptionId;
  }
}
