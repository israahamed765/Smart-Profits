import { DEVICE_SWAP_MAX_AGE_HOURS } from "@/shared/contracts/nac-contract";
import { backendApiRoute } from "./api-route";
import { simulateDeviceSwapCheck } from "../services/nac";

export function POST(request: Request) {
  return backendApiRoute(request, async (req) => {
    const body = (await req.json()) as { phoneNumber?: string; maxAge?: number };
    const email = req.headers.get("x-merchant-email") || "";
    const phoneNumber = String(body.phoneNumber || "");
    if (!phoneNumber) return Response.json({ error: "phoneNumber is required" }, { status: 400 });
    const result = await simulateDeviceSwapCheck(
      { phoneNumber, maxAge: Number(body.maxAge) || DEVICE_SWAP_MAX_AGE_HOURS },
      email,
    );
    return Response.json(result);
  });
}
