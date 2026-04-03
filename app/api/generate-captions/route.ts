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

    const orderedSteps = [...(body.steps ?? [])].sort((a, b) => a.position - b.position);

    const promptChain = orderedSteps.map((step) => ({
      step: step.position,
      title: step.title,
      instruction: step.instruction
    }));

    const configuredPath = process.env.ALMOSTCRACKD_CAPTIONS_PATH;
    const candidatePaths = Array.from(
      new Set([configuredPath, '/captions/generate', '/captions'].filter(Boolean))
    );

    let response: Response | null = null;
    let responseBody: unknown = null;
    let attemptedPaths: string[] = [];

    for (const candidatePath of candidatePaths) {
      attemptedPaths.push(candidatePath as string);
      const nextResponse = await fetch(`${apiUrl}${candidatePath}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify({
          image_url: body.imageUrl,
          humor_flavor: {
            id: body.flavor?.id,
            name: body.flavor?.name ?? body.flavor?.slug ?? 'Custom Flavor',
            description: body.flavor?.description ?? null,
            prompt_chain: promptChain
          }
        })
      });

      const responseText = await nextResponse.text();
      let nextBody: unknown = responseText;
      try {
        nextBody = responseText ? (JSON.parse(responseText) as unknown) : null;
      } catch {
        // keep raw text
      }

      response = nextResponse;
      responseBody = nextBody;

      // if route exists or at least is not "method not allowed", stop trying fallbacks
      if (nextResponse.status !== 405) {
        break;
      }
    }

    if (!response) {
      return NextResponse.json(
        { error: 'No response from upstream API', attempted_paths: attemptedPaths },
        { status: 502 }
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: 'API request failed', details: responseBody, attempted_paths: attemptedPaths },
        { status: response.status }
      );
    }

    return NextResponse.json({ data: responseBody });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unexpected error'
      },
      { status: 500 }
    );
  }
}
