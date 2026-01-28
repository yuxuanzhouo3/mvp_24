import { NextResponse } from "next/server";
import { checkHealth } from "../../../lib/health";
import { captureException } from "../../../lib/sentry";

export async function GET() {
  try {
    const body = checkHealth();
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    try {
      captureException(err);
    } catch (e) {
      // ignore capture errors
    }
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
