// Public Interface for src/features/internal-operations.
export {
  recordSensitiveInternalAccess,
  requireInternalOperator,
} from "./access";

export { checkReadiness } from "./readiness";

export { deploymentRevision } from "./revision";

export {
  getInternalHealth,
  type HealthCheck,
  type HealthStatus,
  type InternalHealth,
} from "./health";

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
