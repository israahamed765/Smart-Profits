import { backendApiRoute, jsonOk } from "./api-route";
import { nacCatalog } from "../services/nac";

export function GET(request: Request) {
  return backendApiRoute(request, async () => jsonOk(nacCatalog()));
}
