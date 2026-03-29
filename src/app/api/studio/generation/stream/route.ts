import { LLM_MAX_SCREENS_PER_JOB } from "@/lib/schema/llm-screens-envelope";
import {
  runStreamingGeneration,
  type SSEEvent,
} from "@/lib/studio/run-generation-job-streaming";
import type { ThinkingMode } from "@/lib/llm/thinking-mode";
import type { LLMProvider } from "@/lib/llm/studio-models";
import type { GenerationPipelineOverrides } from "@/lib/studio/pipeline-models";

export const maxDuration = 600;

const THINKING: ThinkingMode[] = [
  "auto",
  "fast",
  "think",
  "sync-neurons",
  "go-all-in",
];

function sseEncode(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(
      sseEncode({ type: "error", message: "Invalid JSON" }),
      {
        status: 400,
        headers: { "Content-Type": "text/event-stream" },
      },
    );
  }

  if (!body || typeof body !== "object") {
    return new Response(
      sseEncode({ type: "error", message: "Invalid body" }),
      {
        status: 400,
        headers: { "Content-Type": "text/event-stream" },
      },
    );
  }

  const jobId = (body as { jobId?: unknown }).jobId;
  const thinkingModeRaw = (body as { thinkingMode?: unknown }).thinkingMode;
  const focusNodeIdRaw = (body as { focusNodeId?: unknown }).focusNodeId;
  const focusNodeId =
    typeof focusNodeIdRaw === "string" && focusNodeIdRaw.trim()
      ? focusNodeIdRaw.trim()
      : null;

  const screenCountRaw = (body as { screenCount?: unknown }).screenCount;
  const primaryScreenPreserveRaw = (body as { primaryScreenPreserve?: unknown })
    .primaryScreenPreserve;
  const additionalScreenDimensionsRaw = (
    body as { additionalScreenDimensions?: unknown }
  ).additionalScreenDimensions;

  let screenCount: number | null = null;
  if (typeof screenCountRaw === "number" && Number.isInteger(screenCountRaw)) {
    if (screenCountRaw >= 1 && screenCountRaw <= LLM_MAX_SCREENS_PER_JOB) {
      screenCount = screenCountRaw;
    }
  } else if (
    typeof screenCountRaw === "string" &&
    /^\d+$/.test(screenCountRaw)
  ) {
    const n = parseInt(screenCountRaw, 10);
    if (n >= 1 && n <= LLM_MAX_SCREENS_PER_JOB) screenCount = n;
  }

  const primaryScreenPreserve = primaryScreenPreserveRaw === true;

  const attachedImagesRaw = (body as { attachedImages?: unknown }).attachedImages;
  const attachedImages: { base64: string; mimeType: string; filename: string; url?: string }[] = [];
  if (Array.isArray(attachedImagesRaw)) {
    for (const img of attachedImagesRaw) {
      if (
        img &&
        typeof img === "object" &&
        typeof (img as Record<string, unknown>).base64 === "string" &&
        typeof (img as Record<string, unknown>).mimeType === "string" &&
        typeof (img as Record<string, unknown>).filename === "string"
      ) {
        const mimeType = (img as { mimeType: string }).mimeType;
        if (mimeType.startsWith("image/") && attachedImages.length < 6) {
          const url = typeof (img as Record<string, unknown>).url === "string"
            ? (img as { url: string }).url
            : undefined;
          attachedImages.push({
            base64: (img as { base64: string }).base64,
            mimeType,
            filename: (img as { filename: string }).filename,
            ...(url ? { url } : {}),
          });
        }
      }
    }
  }

  let additionalScreenDimensions: { width: number; height: number } | null =
    null;
  if (
    additionalScreenDimensionsRaw &&
    typeof additionalScreenDimensionsRaw === "object" &&
    !Array.isArray(additionalScreenDimensionsRaw)
  ) {
    const o = additionalScreenDimensionsRaw as Record<string, unknown>;
    const width = typeof o.width === "number" ? o.width : Number(o.width);
    const height = typeof o.height === "number" ? o.height : Number(o.height);
    if (
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      width >= 200 &&
      height >= 200 &&
      width <= 4096 &&
      height <= 4096
    ) {
      additionalScreenDimensions = {
        width: Math.round(width),
        height: Math.round(height),
      };
    }
  }

  if (typeof jobId !== "string" || !jobId.trim()) {
    return new Response(
      sseEncode({ type: "error", message: "jobId required" }),
      {
        status: 400,
        headers: { "Content-Type": "text/event-stream" },
      },
    );
  }
  const jobIdTrim = jobId.trim();
  const uuidLike =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidLike.test(jobIdTrim)) {
    return new Response(
      sseEncode({ type: "error", message: "Invalid jobId" }),
      {
        status: 400,
        headers: { "Content-Type": "text/event-stream" },
      },
    );
  }

  const thinkingMode =
    typeof thinkingModeRaw === "string" &&
    THINKING.includes(thinkingModeRaw as ThinkingMode)
      ? (thinkingModeRaw as ThinkingMode)
      : ("fast" satisfies ThinkingMode);

  const pipelineRaw = (body as { pipeline?: unknown }).pipeline;
  let pipeline: GenerationPipelineOverrides | null = null;
  if (
    pipelineRaw &&
    typeof pipelineRaw === "object" &&
    !Array.isArray(pipelineRaw)
  ) {
    const p = pipelineRaw as Record<string, unknown>;
    const uiModel =
      typeof p.uiModel === "string" && p.uiModel.trim() ? p.uiModel.trim() : undefined;
    const img = p.imageSynthesisProvider;
    const imageSynthesisProvider =
      img === "openai" || img === "google" || img === "xai" || img === "auto"
        ? (img as LLMProvider | "auto")
        : undefined;
    if (uiModel || imageSynthesisProvider) {
      pipeline = {
        ...(uiModel ? { uiModel } : {}),
        ...(imageSynthesisProvider ? { imageSynthesisProvider } : {}),
      };
    }
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        await runStreamingGeneration(
          jobIdTrim,
          thinkingMode,
          (event) => {
            try {
              controller.enqueue(encoder.encode(sseEncode(event)));
            } catch {
              /* stream may have been closed by client */
            }
          },
          {
            focusNodeId,
            screenCount,
            primaryScreenPreserve,
            additionalScreenDimensions,
            attachedImages: attachedImages.length > 0 ? attachedImages : undefined,
            pipeline,
            existingProjectContext:
              typeof (body as Record<string, unknown>).existingProjectContext === "string"
                ? ((body as Record<string, unknown>).existingProjectContext as string).slice(0, 150_000)
                : null,
          },
        );
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Internal generation error";
        console.error("[generation/stream] unhandled:", err);
        try {
          controller.enqueue(
            encoder.encode(sseEncode({ type: "error", message: msg })),
          );
        } catch {
          /* stream closed */
        }
      } finally {
        try {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
