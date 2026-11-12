/**
 * RFC 9457 problem details, as every API error is returned (TECHNICAL_PLAN §1.4, §4.1).
 */
export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  request_id?: string;
  errors?: { field: string; message: string }[];
  /** Extension used by auth lockout: ISO timestamp when the account unlocks. */
  locked_until?: string;
}

export class ApiError extends Error {
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.detail ?? problem.title);
    this.name = "ApiError";
    this.problem = problem;
  }

  get status(): number {
    return this.problem.status;
  }

  get requestId(): string | undefined {
    return this.problem.request_id;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}
