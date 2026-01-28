// app/api/csrf/route.ts - CSRF token生成API
import { NextRequest } from "next/server";
import { generateCSRFToken } from "@/lib/csrf";

export async function GET(request: NextRequest) {
  return generateCSRFToken(request);
}
