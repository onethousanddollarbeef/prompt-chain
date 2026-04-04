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

    const apiUrl = 'https://api.almostcrackd.ai';
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

    const normalizeDetails = (details: unknown) => {
      if (typeof details !== 'string') return details;
      if (details.includes('<!DOCTYPE html') || details.includes('<html')) {
        return 'Upstream returned HTML (likely wrong endpoint path).';
      }
      return details;
    };

    const candidatePaths = (path: string) => [path, `/api${path}`];
    const postToCandidatePaths = async (paths: string[], payload: unknown) => {
      const attemptedUrls: string[] = [];

      for (const candidatePath of paths) {
        const targetUrl = `${apiUrl}${candidatePath}`;
        attemptedUrls.push(targetUrl);

        const res = await fetch(targetUrl, {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify(payload)
        });
        const parsedBody = await parseJsonOrText(res);

        if (res.ok) {
          return { ok: true as const, parsedBody, attemptedUrls };
        }

        const responseLooksLikeMissingRoute =
          res.status === 404 ||
          (typeof parsedBody === 'string' && parsedBody.includes('<!DOCTYPE html')) ||
          (typeof parsedBody === 'object' &&
            parsedBody !== null &&
            'message' in parsedBody &&
            String(parsedBody.message).toLowerCase().includes('not found'));

        if (!responseLooksLikeMissingRoute) {
          return {
            ok: false as const,
            status: res.status,
            parsedBody: normalizeDetails(parsedBody),
            attemptedUrls
          };
        }
      }

      return {
        ok: false as const,
        status: 404,
        parsedBody: 'Could not find a working endpoint.',
        attemptedUrls
      };
    };

    const postToPipeline = async (path: string, payload: unknown) =>
      postToCandidatePaths(candidatePaths(path), payload);

    const postToLegacyCaptions = async (imageUrl: string) =>
      postToCandidatePaths(
        [
          '/captions/generate',
          '/api/captions/generate',
          '/captions',
          '/api/captions',
          '/generate-captions',
          '/api/generate-captions'
        ],
        {
          image_url: imageUrl,
          humor_flavor: {
            id: body.flavor?.id,
            name: body.flavor?.name ?? body.flavor?.slug ?? 'Custom Flavor',
            description: body.flavor?.description ?? null,
            prompt_chain: promptChain
          }
        }
      );

    let upstreamImageUrl = body.imageUrl;

    if (body.imageUrl?.startsWith('data:')) {
      const matches = body.imageUrl.match(/^data:(.*?);base64,(.*)$/);
      if (!matches) {
        return NextResponse.json({ error: 'Invalid data URL image format.' }, { status: 400 });
      }

      const contentType = matches[1] || 'image/png';
      const imageBytes = Buffer.from(matches[2], 'base64');

      const presignedResponse = await postToPipeline('/pipeline/generate-presigned-url', { contentType });
      if (!presignedResponse.ok) {
        const legacyCaptions = await postToLegacyCaptions(body.imageUrl);
        if (legacyCaptions.ok) {
          return NextResponse.json({
            data: legacyCaptions.parsedBody,
            image_url: body.imageUrl,
            image_id: null,
            mode: 'legacy-captions-fallback'
          });
        }

        return NextResponse.json(
          {
            error: 'Step 1 failed: image upload preparation (generate-presigned-url)',
            details: presignedResponse.parsedBody,
            attempted_urls: [...presignedResponse.attemptedUrls, ...legacyCaptions.attemptedUrls]
          },
          { status: presignedResponse.status }
        );
      }

      const presignedPayload = presignedResponse.parsedBody as { presignedUrl: string; cdnUrl: string };
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

    const registerResponse = await postToPipeline('/pipeline/upload-image-from-url', {
      imageUrl: upstreamImageUrl,
      isCommonUse: false
    });
    if (!registerResponse.ok) {
      const legacyCaptions = await postToLegacyCaptions(upstreamImageUrl);
      if (legacyCaptions.ok) {
        return NextResponse.json({
          data: legacyCaptions.parsedBody,
          image_url: upstreamImageUrl,
          image_id: null,
          mode: 'legacy-captions-fallback'
        });
      }

      return NextResponse.json(
        {
          error: 'Step 3 failed: upload-image-from-url',
          details: registerResponse.parsedBody,
          attempted_urls: [...registerResponse.attemptedUrls, ...legacyCaptions.attemptedUrls]
        },
        { status: registerResponse.status }
      );
    }

    const registerPayload = registerResponse.parsedBody as { imageId: string };
    if (!registerPayload?.imageId) {
      return NextResponse.json(
        { error: 'Step 3 failed: missing imageId in response', details: registerResponse.parsedBody },
        { status: 502 }
      );
    }

    const captionsResponse = await postToPipeline('/pipeline/generate-captions', {
      imageId: registerPayload.imageId,
      humor_flavor: {
        id: body.flavor?.id,
        name: body.flavor?.name ?? body.flavor?.slug ?? 'Custom Flavor',
        description: body.flavor?.description ?? null,
        prompt_chain: promptChain
      }
    });

    if (!captionsResponse.ok) {
      const legacyCaptions = await postToLegacyCaptions(upstreamImageUrl);
      if (legacyCaptions.ok) {
        return NextResponse.json({
          data: legacyCaptions.parsedBody,
          image_url: upstreamImageUrl,
          image_id: registerPayload.imageId,
          mode: 'legacy-captions-fallback'
        });
      }

      return NextResponse.json(
        {
          error: 'Step 4 failed: generate-captions',
          details: captionsResponse.parsedBody,
          attempted_urls: [...captionsResponse.attemptedUrls, ...legacyCaptions.attemptedUrls]
        },
        { status: captionsResponse.status }
      );
    }

    return NextResponse.json({
      data: captionsResponse.parsedBody,
      image_url: upstreamImageUrl,
      image_id: registerPayload.imageId,
      mode: 'pipeline'
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
