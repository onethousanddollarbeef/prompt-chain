import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_API_URL = 'https://api.almostcrackd.ai';
const PRIMARY_API_PATH = '/pipeline/generate_captions';
const FALLBACK_API_PATH = '/captions/generate';

type IncomingStep = {
  position: number;
  title: string;
  instruction: string;
};

type IncomingFlavor = {
  id: string;
  slug?: string;
  name?: string;
  description?: string | null;
};

type ApiErrorPayload = {
  error?: string;
  details?: unknown;
};

async function postToApi(
  apiUrl: string,
  apiPath: string,
  apiKey: string | undefined,
  body: {
    flavor: IncomingFlavor;
    steps: IncomingStep[];
    imageUrl: string;
  }
) {
  const orderedSteps = [...(body.steps ?? [])].sort((a, b) => a.position - b.position);
  const promptChain = orderedSteps.map((step) => ({
    step: step.position,
    title: step.title,
    instruction: step.instruction
  }));

  const response = await fetch(`${apiUrl}${apiPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify({
      image_url: body.imageUrl,
      humor_flavor: {
        id: body.flavor?.id,
        name: body.flavor?.name ?? body.flavor?.slug ?? null,
        description: body.flavor?.description ?? null,
        prompt_chain: promptChain
      }
    })
  });

  const responseText = await response.text();
  let parsedBody: unknown = null;
  if (responseText) {
    try {
      parsedBody = JSON.parse(responseText);
    } catch {
      parsedBody = responseText;
    }
  }
  return { response, parsedBody };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      flavor: IncomingFlavor;
      steps: IncomingStep[];
      imageUrl: string;
    };

    const apiUrl = process.env.ALMOSTCRACKD_API_URL ?? DEFAULT_API_URL;
    const apiKey = process.env.ALMOSTCRACKD_API_KEY;
    const pathsToTry = [PRIMARY_API_PATH, FALLBACK_API_PATH];

    let lastStatus = 500;
    let lastErrorPayload: ApiErrorPayload = { error: 'API request failed' };

    for (const path of pathsToTry) {
      const { response, parsedBody } = await postToApi(apiUrl, path, apiKey, body);

      if (response.ok) {
        return NextResponse.json({ data: parsedBody, endpoint: `${apiUrl}${path}` });
      }

      lastStatus = response.status;
      lastErrorPayload = {
        error: `API request failed at ${path}`,
        details: parsedBody
      };

      if (response.status !== 404) {
        break;
      }
    }

    return NextResponse.json(lastErrorPayload, { status: lastStatus });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unexpected error'
      },
      { status: 500 }
    );
  }
}
