// Public Interface for src/features/internal-operations.
export {
  recordSensitiveInternalAccess,
  requireInternalOperator,
} from "./access";

export {
  getValidationMetrics,
  MetricsError,
  type ValidationMetrics,
  type ValidationMetricsWindow,
  type RepairStatusNow,
} from "./metrics";

export {
  INTERNAL_OPERATION_CATEGORIES,
  type InternalAccess,
  type InternalOperationCategory,
} from "./types";
