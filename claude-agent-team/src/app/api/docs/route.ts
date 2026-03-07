import { generateOpenAPISpec } from "@/lib/openapi";

export async function GET() {
  const spec = generateOpenAPISpec();
  return Response.json(spec);
}
