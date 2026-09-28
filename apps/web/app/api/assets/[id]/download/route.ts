import { presignDownload } from '@pod-vector-studio/shared/storage';
import { NextResponse, type NextRequest } from 'next/server';
import { downloadFilename, getOwnedAsset } from '@/lib/assets';
import { getSessionUserId, unauthorized } from '@/lib/auth';
import { notFound } from '@/lib/http';

const EXPIRES_IN = 300;

// GET /api/assets/:id/download — short-lived presigned URL that downloads as a file.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const asset = await getOwnedAsset(params.id, userId);
  if (!asset) return notFound();

  const url = await presignDownload(asset.storageKey, {
    expiresIn: EXPIRES_IN,
    filename: downloadFilename(asset.project.name, asset),
  });
  return NextResponse.json({ url, expiresIn: EXPIRES_IN });
}
