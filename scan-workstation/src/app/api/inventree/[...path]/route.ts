import { NextRequest, NextResponse } from "next/server";

const INVENTREE_URL = process.env.INVENTREE_URL || "http://localhost:1880";
const INVENTREE_TOKEN = process.env.INVENTREE_TOKEN || "";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, await params);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, await params);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, await params);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, await params);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, await params);
}

async function proxyRequest(
  request: NextRequest,
  params: { path: string[] }
) {
  if (!INVENTREE_TOKEN) {
    return NextResponse.json(
      { error: "INVENTREE_TOKEN not configured. Set it in .env.local" },
      { status: 500 }
    );
  }

  const path = params.path.join("/");
  const searchParams = request.nextUrl.searchParams.toString();
  const url = `${INVENTREE_URL}/api/${path}/${searchParams ? `?${searchParams}` : ""}`;

  const headers: Record<string, string> = {
    Authorization: `Token ${INVENTREE_TOKEN}`,
    Accept: "application/json",
  };

  let body: string | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.text();
    if (body) {
      headers["Content-Type"] = "application/json";
    }
  }

  try {
    const resp = await fetch(url, {
      method: request.method,
      headers,
      body: body || undefined,
    });

    const data = await resp.text();

    return new NextResponse(data, {
      status: resp.status,
      headers: {
        "Content-Type": resp.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to connect to InvenTree",
        detail: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 502 }
    );
  }
}
