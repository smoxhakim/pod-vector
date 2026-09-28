import { NextResponse, type NextRequest } from 'next/server';

export function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

export function notFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export function serviceUnavailable(error: string) {
  return NextResponse.json({ error }, { status: 503 });
}

/** Parses a JSON body, returning undefined (→ 400) on malformed input. */
export async function readJson(req: NextRequest): Promise<unknown | undefined> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}
