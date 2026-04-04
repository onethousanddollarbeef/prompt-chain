import { NextRequest, NextResponse } from 'next/server';

type IncomingStep = {
  position: number;
  title: string;
  instruction: string;
};

type IncomingFlavor = {
  id: string;
  name?: string;
  slug?: string;
  description?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      flavor: IncomingFlavor;
      steps: IncomingStep[];
      imageUrl: string;
    };

    const apiUrl = process.env.ALMOSTCRACKD_API_URL ?? 'https://api.almostcrackd.ai';
    const apiKey = process.env.ALMOSTCRACKD_API_KEY;
    const incomingAuth = req.headers.get('authorization');

    const orderedSteps = [...(body.steps ?? [])].sort((a, b) => a.position - b.position);
    const promptChain = orderedSteps.map((step) => ({
      step: step.position,
      title: step.title,
      instruction: step.instruction
    }));

    const authHeader = incomingAuth ?? (apiKey ? `Bearer ${apiKey}` : null);
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Missing auth. Log in first or configure ALMOSTCRACKD_API_KEY.' },
        { status: 401 }
      );
    }

    const jsonHeaders = {
      Authorization: authHeader,
      'Content-Type': 'application/json'
    };

    const parseJsonOrText = async (res: Response) => {
      const text = await res.text();
      if (!text) return null;
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return text;
      }
    };

    let upstreamImageUrl = body.imageUrl;

    if (body.imageUrl?.startsWith('data:')) {
      const matches = body.imageUrl.match(/^data:(.*?);base64,(.*)$/);
      if (!matches) {
        return NextResponse.json({ error: 'Invalid data URL image format.' }, { status: 400 });
      }

      const contentType = matches[1] || 'image/png';
      const imageBytes = Buffer.from(matches[2], 'base64');

      const presignedRes = await fetch(`${apiUrl}/pipeline/generate-presigned-url`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ contentType })
      });

      const presignedBody = await parseJsonOrText(presignedRes);
      if (!presignedRes.ok) {
        return NextResponse.json(
          { error: 'Step 1 failed: generate-presigned-url', details: presignedBody },
          { status: presignedRes.status }
        );
      }

      const presignedPayload = presignedBody as { presignedUrl: string; cdnUrl: string };
      const uploadRes = await fetch(presignedPayload.presignedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: imageBytes
      });

      if (!uploadRes.ok) {
        const uploadBody = await uploadRes.text();
        return NextResponse.json(
          { error: 'Step 2 failed: upload to presigned URL', details: uploadBody || uploadRes.statusText },
          { status: uploadRes.status }
        );
      }

      upstreamImageUrl = presignedPayload.cdnUrl;
    }

    const registerRes = await fetch(`${apiUrl}/pipeline/upload-image-from-url`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ imageUrl: upstreamImageUrl, isCommonUse: false })
    });
    const registerBody = await parseJsonOrText(registerRes);
    if (!registerRes.ok) {
      return NextResponse.json(
        { error: 'Step 3 failed: upload-image-from-url', details: registerBody },
        { status: registerRes.status }
      );
    }

    const registerPayload = registerBody as { imageId: string };
    if (!registerPayload?.imageId) {
      return NextResponse.json(
        { error: 'Step 3 failed: missing imageId in response', details: registerBody },
        { status: 502 }
      );
    }

    const captionsRes = await fetch(`${apiUrl}/pipeline/generate-captions`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        imageId: registerPayload.imageId,
        humor_flavor: {
          id: body.flavor?.id,
          name: body.flavor?.name ?? body.flavor?.slug ?? 'Custom Flavor',
          description: body.flavor?.description ?? null,
          prompt_chain: promptChain
        }
      })
    });

    const captionsBody = await parseJsonOrText(captionsRes);
    if (!captionsRes.ok) {
      return NextResponse.json(
        { error: 'Step 4 failed: generate-captions', details: captionsBody },
        { status: captionsRes.status }
      );
    }

    return NextResponse.json({
      data: captionsBody,
      image_url: upstreamImageUrl,
      image_id: registerPayload.imageId
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unexpected error'
      },
      { status: 500 }
    );
  }
}
