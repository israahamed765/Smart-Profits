import { backendApiRoute } from "./api-route";
import { simulateLocationVerify } from "../services/nac";

export function POST(request: Request) {
  return backendApiRoute(request, async (req) => {
    const body = (await req.json()) as {
      device?: { phoneNumber?: string };
      area?: { areaType?: string; center?: { latitude: number; longitude: number }; radius?: number };
    };
    const email = req.headers.get("x-merchant-email") || "";
    const phoneNumber = String(body.device?.phoneNumber || "");
    const center = body.area?.center;
    if (!phoneNumber || center?.latitude == null || center?.longitude == null) {
      return Response.json({ error: "device.phoneNumber and area.center are required" }, { status: 400 });
    }
    return Response.json(
      await simulateLocationVerify(
        {
          device: { phoneNumber },
          area: {
            areaType: "CIRCLE",
            center: { latitude: center.latitude, longitude: center.longitude },
            radius: Number(body.area?.radius) || 2000,
          },
        },
        email,
      ),
    );
  });
}
