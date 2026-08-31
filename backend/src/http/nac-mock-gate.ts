import { backendApiRoute } from "./api-route";
import { runNokiaMockGate } from "../services/nac";

export function POST(request: Request) {
  return backendApiRoute(request, async (req) => {
    try {
      const body = (await req.json()) as {
        phoneNumber?: string;
        action?: string;
        email?: string;
      };
      const result = await runNokiaMockGate({
        phoneNumber: body.phoneNumber,
        action: body.action,
        email: body.email,
        headerEmail: req.headers.get("x-merchant-email") || "",
      });
      return Response.json(result.body, { status: result.status });
    } catch {
      return Response.json({ error: "Nokia mock gate failed." }, { status: 500 });
    }
  });
}
