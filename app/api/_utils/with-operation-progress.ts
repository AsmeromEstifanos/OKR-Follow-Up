import { getOperationIdFromRequest, runWithOperationProgress, updateOperationProgress } from "@/lib/operation-progress";
import { logSuccessfulRequestActivity } from "@/app/api/_utils/user-activity-log";
import type { NextRequest } from "next/server";

export async function withOperationProgress<T>(
  request: NextRequest,
  initialStage: string,
  action: () => Promise<T>
): Promise<T> {
  return runWithOperationProgress(getOperationIdFromRequest(request), initialStage, async () => {
    updateOperationProgress(6, initialStage);
    const result = await action();

    try {
      await logSuccessfulRequestActivity(request, initialStage, result);
    } catch {
      // Activity logging should never block the primary mutation path.
    }

    return result;
  });
}
