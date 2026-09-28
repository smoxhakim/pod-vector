import { NextResponse, type NextRequest } from 'next/server';
import { getOwnedAsset, toAssetDTO } from '@/lib/assets';
import { getSessionUserId, unauthorized } from '@/lib/auth';
import { notFound } from '@/lib/http';

// GET /api/assets/:id — asset metadata.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const asset = await getOwnedAsset(params.id, userId);
  if (!asset) return notFound();
  return NextResponse.json({ asset: toAssetDTO(asset) });
}
