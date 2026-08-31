import {
  listMerchantGuardLogs,
  getGuardDemoFlags,
  saveGuardDemoFlags,
  sendStepUpNetworkCode,
  evaluateSensitiveAction,
  verifyStepUpNetworkCode,
} from "@/server/services/guard.service";
import { requireGuardAllow } from "@/server/smart-guard/enforce";

export {
  listMerchantGuardLogs,
  getGuardDemoFlags,
  saveGuardDemoFlags,
  sendStepUpNetworkCode,
  evaluateSensitiveAction,
  verifyStepUpNetworkCode,
  requireGuardAllow,
};

/** Live function bag so HTTP can fail-close without copying Guard logic. */
export const guardApi = {
  evaluateSensitiveAction,
};
