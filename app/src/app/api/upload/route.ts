import { NextRequest, NextResponse } from "next/server";

// Pins an uploaded image to IPFS via Pinata and returns ipfs://<CID>.
// The Pinata JWT stays server-side (set PINATA_JWT in env; never NEXT_PUBLIC_).
export const runtime = "nodejs";

const MAX_BYTES = 4 * 1024 * 1024; // 4MB (stays under Vercel's serverless body limit)

export async function POST(req: NextRequest) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    return NextResponse.json({ error: "Image uploads are not configured (PINATA_JWT missing)." }, { status: 501 });
  }

  let file: FormDataEntryValue | null;
  try {
    const form = await req.formData();
    file = form.get("file");
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Images only." }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image must be 4MB or smaller." }, { status: 413 });

  const body = new FormData();
  body.append("file", file, file.name || "token-image");

  let res: Response;
  try {
    res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body,
    });
  } catch {
    return NextResponse.json({ error: "Could not reach the pinning service." }, { status: 502 });
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    return NextResponse.json({ error: "Pinning failed.", detail }, { status: 502 });
  }

  const json = (await res.json()) as { IpfsHash?: string };
  const cid = json.IpfsHash;
  if (!cid) return NextResponse.json({ error: "Pinning returned no CID." }, { status: 502 });

  return NextResponse.json({ cid, uri: `ipfs://${cid}` });
}
