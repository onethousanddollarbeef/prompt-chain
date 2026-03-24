import { NextRequest, NextResponse } from 'next/server';

type IncomingStep = {
  position: number;
  title: string;
  instruction: string;
};

type IncomingFlavor = {
  id: string;
  name: string;
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

    const response = await fetch(`${apiUrl}/captions/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({
        image_url: body.imageUrl,
        humor_flavor: {
          id: body.flavor?.id,
          name: body.flavor?.name,
          description: body.flavor?.description ?? null,
          prompt_chain: promptChain
        }
      })
    });

    const responseBody = (await response.json()) as unknown;

    if (!response.ok) {
      return NextResponse.json(
        { error: 'API request failed', details: responseBody },
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
