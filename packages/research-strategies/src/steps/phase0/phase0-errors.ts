/** 自动发现等场景：上游暂无可用年报 PDF（常见为尚未披露），与网络/参数错误区分 */
export class Phase0NoDataError extends Error {
  readonly phase0Kind = "NO_DATA" as const;

  constructor(message: string) {
    super(message);
    this.name = "Phase0NoDataError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isPhase0NoDataError(error: unknown): error is Phase0NoDataError {
  return error instanceof Phase0NoDataError;
}
