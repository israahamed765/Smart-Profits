import { backendApiRoute } from "./api-route";
import { simulateNumberVerify } from "../services/nac";

export function POST(request: Request) {
  return backendApiRoute(request, async (req) => {
    const body = (await req.json()) as { phoneNumber?: string };
    const email = req.headers.get("x-merchant-email") || "";
    const phoneNumber = String(body.phoneNumber || "");
    if (!phoneNumber) return Response.json({ error: "phoneNumber is required" }, { status: 400 });
    return Response.json(await simulateNumberVerify({ phoneNumber }, email));
  });
}
