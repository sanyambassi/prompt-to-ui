import * as fs from "fs";
import * as path from "path";
import { revalidatePath } from "next/cache";
import {
  createStudioChatMessage,
  listStudioChatMessages,
} from "@/actions/studio/chat-messages";
import { createStudioScreen } from "@/actions/studio/screens";
import {
  streamUiSchemaJson,
  type StreamEvent,
} from "@/lib/llm/complete-ui-schema-streaming";
import { extractJsonObjectFromLlmText } from "@/lib/llm/complete-ui-schema";
import { generateImage } from "@/lib/llm/generate-image";
import {
  resolveImageSynthesisProviderForPipeline,
  resolveUiModelForPipeline,
  type GenerationPipelineOverrides,
} from "@/lib/studio/pipeline-models";
import {
  appendGrokCompositionHint,
  inferGeminiImageSynthesisConfig,
  inferOpenAIImageSize,
} from "@/lib/studio/infer-image-gen-size";
import { type ThinkingMode, resolveAutoThinking } from "@/lib/llm/thinking-mode";
import { resolveAutoModelWithKeys } from "@/lib/llm/resolve-auto-model-server";
import type { StudioModelId } from "@/lib/llm/studio-models";
import {
  buildHtmlPrototypeRefineUserPrompt,
  buildHtmlPrototypeUserPrompt,
} from "@/lib/prompts/html-prototype-generation";
import {
  appendScreenCountPreference,
  appendSelectedElementContext,
} from "@/lib/prompts/ui-schema-generation";
import { findUiSchemaNodeById } from "@/lib/schema/find-ui-schema-node";
import {
  buildHtmlDocumentUiSchema,
  getHtmlDocumentString,
} from "@/lib/schema/html-document";
import {
  extractCompletedScreensFromPartial,
  parseHtmlScreensEnvelope,
  type HtmlScreenEntry,
} from "@/lib/schema/html-screens-envelope";
import {
  type LlmPrototypeLinkDraft,
  type LlmScreenEntry,
} from "@/lib/schema/llm-screens-envelope";
import type { UISchema } from "@/lib/schema/types";
import { collectImagePromptsFromHtml, replaceHtmlImageSrc } from "@/lib/schema/walk-image-nodes";
import { query, queryOne } from "@/lib/db/pool";
import { getUser } from "@/lib/auth/anonymous-user";
import { resolveGenerationAttachments } from "@/lib/studio/resolve-generation-attachments";
import { generateSuggestions } from "@/lib/studio/generate-suggestions";
import { isDesignSystemScreenName } from "@/lib/studio/screen-display-order";
import { replacePrototypeLinksForScreens } from "@/lib/studio/sync-prototype-links";
import { extractPalette } from "@/lib/schema/extract-palette";
import { DESKTOP_COMPANION_ARTBOARD } from "@/lib/studio/artboard-presets";
import type { ColorSchemeContext, StudioGenerationJobRow } from "@/types/studio";

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

export type SSEEvent =
  | { type: "user_prompt"; text: string }
  | { type: "status"; message: string }
  | { type: "thinking"; text: string }
  | { type: "content"; text: string }
  | { type: "screen"; index: number; name: string }
  | { type: "screen_ready"; index: number; name: string; screenId: string }
  | { type: "palette"; colors: string[] }
  | { type: "image_progress"; current: number; total: number; prompt: string }
  | { type: "image_done"; nodeId: string; url: string }
  | { type: "image_skipped"; reason: string }
  | { type: "suggestions"; items: string[] }
  | { type: "done"; jobId: string; affectedScreenIds?: string[] }
  | { type: "error"; message: string };

export type RunStreamingOptions = {
  focusNodeId?: string | null;
  screenCount?: number | null;
  primaryScreenPreserve?: boolean;
  additionalScreenDimensions?: { width: number; height: number } | null;
  attachedImages?: { base64: string; mimeType: string; filename: string; url?: string }[];
  pipeline?: GenerationPipelineOverrides | null;
  existingProjectContext?: string | null;
};

export async function runStreamingGeneration(
  jobId: string,
  thinkingModeRaw: ThinkingMode,
  onEvent: (event: SSEEvent) => void,
  options?: RunStreamingOptions,
): Promise<void> {
  const thinkingMode = resolveAutoThinking(thinkingModeRaw);
  const user = getUser();

  const job = await queryOne<StudioGenerationJobRow>(
    `SELECT * FROM studio_generation_jobs WHERE id = $1 AND user_id = $2`,
    [jobId, user.id],
  );

  if (!job) {
    onEvent({ type: "error", message: "Job not found" });
    return;
  }

  if (job.status === "success" || job.status === "error") {
    onEvent({ type: "status", message: "Job already completed" });
    onEvent({ type: "done", jobId });
    return;
  }
  if (job.status !== "pending" && job.status !== "running") {
    onEvent({ type: "error", message: `Job has unexpected status: ${job.status}` });
    return;
  }
  if (!job.screen_id) {
    onEvent({ type: "error", message: "No target screen on job" });
    return;
  }
  const screenId: string = job.screen_id;
  if (!job.model?.trim()) {
    onEvent({ type: "error", message: "No model on job" });
    return;
  }

  const jobModel = await resolveAutoModelWithKeys(job.model.trim() as StudioModelId, thinkingMode);

  const originalUserPrompt =
    typeof job.prompt === "string" ? job.prompt.trim() : "";
  if (originalUserPrompt.length > 0) {
    onEvent({ type: "user_prompt", text: originalUserPrompt });
  }

  const fail = async (message: string) => {
    await query(
      `UPDATE studio_generation_jobs SET status = 'error', error_message = $3, completed_at = $4
       WHERE id = $1 AND user_id = $2`,
      [jobId, user.id, message, new Date().toISOString()],
    );
    revalidatePath(`/project/${job.project_id}`);
    onEvent({ type: "error", message });
  };

  onEvent({ type: "status", message: "Setting up generation…" });

  await query(
    `UPDATE studio_generation_jobs SET status = 'running' WHERE id = $1 AND user_id = $2`,
    [jobId, user.id],
  );

  const screenRow = await queryOne<{
    ui_schema: unknown;
    name: string;
    canvas_x: number;
    canvas_y: number;
    width: number;
    height: number;
    sort_order: number;
  }>(
    `SELECT ui_schema, name, canvas_x, canvas_y, width, height, sort_order
     FROM studio_screens WHERE id = $1 AND user_id = $2`,
    [screenId, user.id],
  );

  if (!screenRow) {
    await fail("Could not load target screen");
    return;
  }

  const existingSchema = screenRow.ui_schema;
  const primaryNameFallback =
    typeof screenRow.name === "string" && screenRow.name.trim()
      ? screenRow.name.trim()
      : "Screen";

  const existingHtml = getHtmlDocumentString(existingSchema as UISchema);
  const refine = (existingHtml?.trim().length ?? 0) >= 80;
  const focusId =
    typeof options?.focusNodeId === "string" ? options.focusNodeId.trim() : "";
  const focusedNode =
    focusId ? findUiSchemaNodeById(existingSchema as UISchema, focusId) : null;

  let existingDesignMd: string | null = null;
  {
    const projRow = await queryOne<{ design_md: string | null }>(
      `SELECT design_md FROM studio_projects WHERE id = $1 AND user_id = $2`,
      [job.project_id, user.id],
    );
    if (projRow && typeof projRow.design_md === "string" && projRow.design_md.trim().length > 0) {
      existingDesignMd = projRow.design_md;
    }
  }

  const vpWidth =
    typeof screenRow.width === "number" && screenRow.width > 0
      ? screenRow.width
      : 1280;
  const vpHeight =
    typeof screenRow.height === "number" && screenRow.height > 0
      ? screenRow.height
      : 800;

  let userPrompt =
    refine && existingHtml
      ? buildHtmlPrototypeRefineUserPrompt(
          existingHtml,
          job.prompt,
          vpWidth,
          vpHeight,
          existingDesignMd,
        )
      : buildHtmlPrototypeUserPrompt(job.prompt, vpWidth, vpHeight);

  const chatListed = await listStudioChatMessages(job.project_id, screenId);
  if (chatListed.ok && chatListed.data.length > 0) {
    const recent = chatListed.data.slice(-24);
    const clip = (s: string, max = 2500) =>
      s.length <= max ? s : `${s.slice(0, max)}… [truncated]`;
    const transcript = recent
      .map((m) => `${m.role.toUpperCase()}: ${clip(m.content)}`)
      .join("\n\n");
    userPrompt = `Prior conversation on this artboard (newest last):\n${transcript}\n\n---\n\n${userPrompt}`;
  }

  userPrompt = appendSelectedElementContext(
    userPrompt,
    focusedNode ? focusId : null,
    existingSchema,
  );

  const requestedCount =
    typeof options?.screenCount === "number" &&
    Number.isFinite(options.screenCount)
      ? Math.round(options.screenCount)
      : null;
  userPrompt = appendScreenCountPreference(userPrompt, requestedCount);

  if (refine && requestedCount === 1) {
    userPrompt += `\n\n[IMPORTANT: You are editing a SINGLE existing screen. Return EXACTLY 1 entry in "screens" — the updated version of THIS artboard only. Do NOT regenerate other project screens or a Design System screen.]`;
  }

  if (!refine && requestedCount === 1) {
    const countResult = await queryOne<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM studio_screens WHERE project_id = $1 AND user_id = $2`,
      [job.project_id, user.id],
    );
    const existingCount = parseInt(countResult?.cnt ?? "0", 10);
    if (existingCount > 1) {
      userPrompt += `\n\n[IMPORTANT: This is an ADDITIONAL screen being added to an existing project. Do NOT include a Design System screen. Generate exactly 1 product screen.]`;
    }
  }

  const colorScheme = (job.context as Record<string, unknown> | null)?.color_scheme as ColorSchemeContext | undefined;
  if (!refine && colorScheme?.name && colorScheme.colors && colorScheme.fonts) {
    const colorLines = Object.entries(colorScheme.colors)
      .map(([token, hex]) => `  - ${token}: ${hex}`)
      .join("\n");
    userPrompt = `[COLOR SCHEME — The user selected a pre-defined color scheme. You MUST use these exact colors and fonts in your design_md, your Design System screen, and all product screens. Build your Tailwind config theme.extend.colors from these tokens.]
Name: ${colorScheme.name}
Mode: ${colorScheme.mode}
Colors:
${colorLines}
Typography: Headline font: ${colorScheme.fonts.headline} | Body font: ${colorScheme.fonts.body}
Use these as your design system foundation. The Design System screen's color swatches, tonal strips, and typography "Aa" samples MUST reflect these exact colors and fonts. You may add complementary shades/tints derived from these base tokens, but the primary palette must match exactly.

---

${userPrompt}`;
  }

  if (!refine && existingDesignMd) {
    userPrompt = `[Existing DESIGN.md — the project's design system. All new screens MUST follow these colors, fonts, and rules.]\n${existingDesignMd.slice(0, 30_000)}\n\n---\n\n${userPrompt}`;
  }
  if (!refine && options?.existingProjectContext) {
    const ctxClip =
      options.existingProjectContext.length > 80_000
        ? `${options.existingProjectContext.slice(0, 80_000)}\n\n[…truncated…]`
        : options.existingProjectContext;
    userPrompt = `[Existing project context — for visual/style continuity ONLY. Do NOT reproduce this page. Create NEW, DIFFERENT screens as the user requests.]\n${ctxClip}\n\n---\n\n${userPrompt}`;
  }

  const { preamble, images } = await resolveGenerationAttachments(
    user.id,
    job.project_id,
    job.context ?? {},
  );
  if (preamble) {
    userPrompt = `${preamble}${userPrompt}`;
  }

  if (options?.attachedImages?.length) {
    const attachmentLines: string[] = [];
    attachmentLines.push("\n[User-attached files]");
    attachmentLines.push("The user attached the following images with their prompt.");
    attachmentLines.push("CRITICAL: When an embeddable URL is provided below, you MUST use that EXACT URL as the `src` attribute in your `<img>` tags. Do NOT substitute it with a different URL (e.g. from Wikipedia, Unsplash, or any other source). Do NOT use data-image-prompt for these images. The embeddable URL points to the user's actual uploaded file stored on this server.");
    for (const att of options.attachedImages) {
      if (images.length < 6) {
        images.push({
          mimeType: att.mimeType,
          base64: att.base64,
          label: att.filename,
        });
        if (att.url) {
          attachmentLines.push(`- ${att.filename} (${att.mimeType}) — image attached as vision input. Embeddable URL: ${att.url}`);
        } else {
          attachmentLines.push(`- ${att.filename} (${att.mimeType}) — image attached as vision input (no embeddable URL)`);
        }
      }
    }
    attachmentLines.push("");
    userPrompt = `${attachmentLines.join("\n")}${userPrompt}`;
  }

  onEvent({ type: "status", message: "Calling model…" });

  let thinkingBuffer = "";
  let thinkingFlushTimer: ReturnType<typeof setTimeout> | null = null;

  const flushThinking = () => {
    if (thinkingBuffer.length > 0) {
      onEvent({ type: "thinking", text: thinkingBuffer });
      thinkingBuffer = "";
    }
    if (thinkingFlushTimer) {
      clearTimeout(thinkingFlushTimer);
      thinkingFlushTimer = null;
    }
  };

  let contentBuffer = "";
  let contentFlushTimer: ReturnType<typeof setTimeout> | null = null;

  const flushContent = () => {
    if (contentBuffer.length > 0) {
      onEvent({ type: "content", text: contentBuffer });
      contentBuffer = "";
    }
    if (contentFlushTimer) {
      clearTimeout(contentFlushTimer);
      contentFlushTimer = null;
    }
  };

  let accumulatedText = "";
  let yieldedScreenCount = 0;
  const progressiveScreens: LlmScreenEntry[] = [];
  const progressiveScreenIds: string[] = [];

  const gap = 80;
  const srcW =
    typeof screenRow.width === "number" && screenRow.width > 0
      ? screenRow.width
      : 1280;
  const srcH =
    typeof screenRow.height === "number" && screenRow.height > 0
      ? screenRow.height
      : 800;
  const extraW = options?.additionalScreenDimensions?.width ?? srcW;
  const extraH = options?.additionalScreenDimensions?.height ?? srcH;
  const baseY =
    typeof screenRow.canvas_y === "number" ? screenRow.canvas_y : 80;

  let progressiveSortBase: number | null = null;
  let progressiveCreatedOrdinal = 0;
  let progressivePlaceX: number | null = null;

  const ensurePlaceX = async () => {
    if (progressivePlaceX !== null) return;
    const { rows: allScreenRows } = await query<{ canvas_x: number; width: number }>(
      `SELECT canvas_x, width FROM studio_screens WHERE project_id = $1 AND user_id = $2`,
      [job.project_id, user.id],
    );
    let maxRight = 0;
    for (const row of allScreenRows) {
      const x = typeof row.canvas_x === "number" ? row.canvas_x : 0;
      const w = typeof row.width === "number" && row.width > 0 ? row.width : 1280;
      maxRight = Math.max(maxRight, x + w);
    }
    progressivePlaceX = maxRight > 0 ? maxRight + gap : 1000;
  };

  const ensureSortBase = async () => {
    if (progressiveSortBase !== null) return;
    const { rows: sortRows } = await query<{ sort_order: number }>(
      `SELECT sort_order FROM studio_screens WHERE project_id = $1 AND user_id = $2`,
      [job.project_id, user.id],
    );
    progressiveSortBase = Math.max(
      0,
      ...(sortRows.map((r) => Number(r.sort_order) || 0)),
    );
  };

  /**
   * Buffer: for new projects, hold product screens until the DS is materialized
   * so the Design System always appears first on the canvas.
   */
  let dsMaterialized = refine;
  const pendingProductScreens: Array<{ entry: HtmlScreenEntry; index: number }> = [];

  const flushPendingScreens = async () => {
    const batch = pendingProductScreens.splice(0);
    for (const p of batch) {
      await materializeScreenInner(p.entry, p.index);
    }
  };

  const materializeScreen = async (entry: HtmlScreenEntry, index: number) => {
    if (progressiveScreenIds[index]) return;
    if (requestedCount != null && index >= requestedCount) return;

    const screenName = entry.name.trim().slice(0, 200) || `Screen ${index + 1}`;
    const isDS = /design\s*system/i.test(screenName);

    if (!refine && !dsMaterialized && !isDS) {
      pendingProductScreens.push({ entry, index });
      return;
    }

    await materializeScreenInner(entry, index);

    if (isDS && !dsMaterialized) {
      dsMaterialized = true;
      await flushPendingScreens();
    }
  };

  const materializeScreenInner = async (entry: HtmlScreenEntry, index: number) => {
    if (progressiveScreenIds[index]) return;

    const uiSchema = buildHtmlDocumentUiSchema(entry.html);
    const screenName = entry.name.trim().slice(0, 200) || `Screen ${index + 1}`;
    progressiveScreens[index] = { name: screenName, ui_schema: uiSchema };
    const isDS = /design\s*system/i.test(screenName);

    if (index === 0) {
      if (refine) return;

      if (isDS && !isDesignSystemScreenName(primaryNameFallback)) {
        await ensureSortBase();
        const sW = DESKTOP_COMPANION_ARTBOARD.width;
        const sH = DESKTOP_COMPANION_ARTBOARD.height;
        const origX = typeof screenRow.canvas_x === "number" ? screenRow.canvas_x : 1000;

        const created = await createStudioScreen(job.project_id, {
          name: screenName,
          ui_schema: uiSchema,
          canvas_x: origX,
          canvas_y: baseY,
          width: sW,
          height: sH,
          sort_order: (progressiveSortBase ?? 0),
        });
        if (created.ok) {
          progressiveScreenIds[0] = created.data.id;
          onEvent({ type: "screen_ready", index: 0, name: screenName, screenId: created.data.id });

          const shiftedX = origX + sW + gap;
          await query(
            `UPDATE studio_screens SET canvas_x = $3 WHERE id = $1 AND user_id = $2`,
            [screenId, user.id, shiftedX],
          );
          progressivePlaceX = shiftedX + srcW + gap;
        }
        return;
      }

      await query(
        `UPDATE studio_screens SET name = $3, ui_schema = $4${
          isDS ? `, width = ${DESKTOP_COMPANION_ARTBOARD.width}, height = ${DESKTOP_COMPANION_ARTBOARD.height}` : ""
        } WHERE id = $1 AND user_id = $2`,
        [screenId, user.id, screenName, JSON.stringify(uiSchema)],
      );
      progressiveScreenIds[0] = screenId;
      onEvent({ type: "screen_ready", index: 0, name: screenName, screenId: screenId });
    } else {
      await ensurePlaceX();
      await ensureSortBase();
      progressiveCreatedOrdinal += 1;
      const sW = isDS ? DESKTOP_COMPANION_ARTBOARD.width : extraW;
      const sH = isDS ? DESKTOP_COMPANION_ARTBOARD.height : extraH;
      const created = await createStudioScreen(job.project_id, {
        name: screenName,
        ui_schema: uiSchema,
        canvas_x: progressivePlaceX ?? 1000,
        canvas_y: baseY,
        width: sW,
        height: sH,
        sort_order: (progressiveSortBase ?? 0) + progressiveCreatedOrdinal,
      });
      if (created.ok) {
        progressiveScreenIds[index] = created.data.id;
        onEvent({ type: "screen_ready", index, name: screenName, screenId: created.data.id });
        progressivePlaceX = (progressivePlaceX ?? 1000) + sW + gap;
      }
    }
  };

  let progressiveParseRunning = false;

  const tryProgressiveParse = async () => {
    if (progressiveParseRunning) return;
    progressiveParseRunning = true;
    try {
      const { screens: newScreens, consumedCount } =
        extractCompletedScreensFromPartial(accumulatedText, yieldedScreenCount);
      for (let i = 0; i < newScreens.length; i++) {
        const screenIndex = yieldedScreenCount + i;
        await materializeScreen(newScreens[i], screenIndex);
      }
      yieldedScreenCount = consumedCount;
    } finally {
      progressiveParseRunning = false;
    }
  };

  const onStreamEvent = (ev: StreamEvent) => {
    if (ev.type === "thinking") {
      thinkingBuffer += ev.text;
      if (!thinkingFlushTimer) {
        thinkingFlushTimer = setTimeout(flushThinking, 300);
      }
      if (thinkingBuffer.length > 200) {
        flushThinking();
      }
    } else if (ev.type === "text") {
      accumulatedText += ev.text;
      contentBuffer += ev.text;
      if (!contentFlushTimer) {
        contentFlushTimer = setTimeout(flushContent, 200);
      }
      if (contentBuffer.length > 300) {
        flushContent();
      }
    }
  };

  const uiModel = await resolveUiModelForPipeline(jobModel, options?.pipeline, thinkingMode);
  if (uiModel !== jobModel) {
    onEvent({
      type: "status",
      message: `Generating with ${uiModel}`,
    });
  }

  const progressiveTimer = setInterval(() => {
    void tryProgressiveParse();
  }, 2000);

  let rawText: string;
  try {
    const out = await streamUiSchemaJson({
      model: uiModel,
      thinkingMode,
      userPrompt,
      refine,
      prototypeFormat: "html_document",
      visionImages: images.map((im) => ({
        mimeType: im.mimeType,
        base64: im.base64,
        label: im.label,
      })),
      onEvent: onStreamEvent,
    });
    flushThinking();
    flushContent();
    rawText = out.rawText;
    await query(
      `UPDATE studio_generation_jobs SET provider = $3 WHERE id = $1 AND user_id = $2`,
      [jobId, user.id, out.provider],
    );
  } catch (e) {
    clearInterval(progressiveTimer);
    flushThinking();
    const msg = e instanceof Error ? e.message : String(e);
    await fail(msg);
    return;
  }

  clearInterval(progressiveTimer);
  await tryProgressiveParse();
  if (!dsMaterialized) {
    dsMaterialized = true;
    await flushPendingScreens();
  }

  onEvent({ type: "status", message: "Finalizing…" });

  let parsedJson: unknown;
  try {
    parsedJson = extractJsonObjectFromLlmText(rawText);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await fail(`Invalid JSON from model: ${msg}`);
    return;
  }

  const prototype_links: LlmPrototypeLinkDraft[] = [];

  const htmlEnv = parseHtmlScreensEnvelope(parsedJson, primaryNameFallback);
  if (!htmlEnv.ok) {
    if (yieldedScreenCount === 0) {
      await fail(htmlEnv.error);
      return;
    }
  }

  const project_title = htmlEnv.ok ? htmlEnv.project_title : undefined;
  const design_md = htmlEnv.ok ? htmlEnv.design_md : undefined;
  const modelSuggestions = htmlEnv.ok ? htmlEnv.suggestions : undefined;

  let screens: LlmScreenEntry[];
  if (htmlEnv.ok) {
    screens = htmlEnv.screens.map((s, i) => {
      if (progressiveScreens[i]) return progressiveScreens[i];
      return { name: s.name, ui_schema: buildHtmlDocumentUiSchema(s.html) };
    });
  } else {
    screens = progressiveScreens.filter(Boolean);
  }

  if (options?.primaryScreenPreserve === true && screens.length >= 2) {
    screens = [
      { name: primaryNameFallback, ui_schema: existingSchema as UISchema },
      ...screens.slice(1),
    ];
  }

  {
    const seenNames = new Set<string>();
    const deduped: typeof screens = [];
    for (let i = 0; i < screens.length; i++) {
      const normName = screens[i].name.toLowerCase().trim();
      if (seenNames.has(normName) && !isDesignSystemScreenName(screens[i].name)) {
        const dupRowId = progressiveScreenIds[i];
        if (dupRowId && dupRowId !== screenId) {
          try {
            await query(`DELETE FROM studio_screens WHERE id = $1`, [dupRowId]);
          } catch { /* orphan cleanup */ }
        }
        continue;
      }
      seenNames.add(normName);
      deduped.push(screens[i]);
    }
    if (deduped.length < screens.length) {
      const oldProgressiveIds = [...progressiveScreenIds];
      progressiveScreenIds.length = 0;
      progressiveScreens.length = 0;
      let newIdx = 0;
      const seenNames2 = new Set<string>();
      for (let i = 0; i < screens.length; i++) {
        const normName = screens[i].name.toLowerCase().trim();
        if (seenNames2.has(normName) && !isDesignSystemScreenName(screens[i].name)) {
          continue;
        }
        seenNames2.add(normName);
        if (oldProgressiveIds[i]) progressiveScreenIds[newIdx] = oldProgressiveIds[i];
        newIdx++;
      }
      screens = deduped;
    }
  }

  if (requestedCount != null && screens.length > requestedCount) {
    if (refine) {
      // Trim extras — clean up any progressively-created orphan screens
      for (let i = requestedCount; i < screens.length; i++) {
        const orphanId = progressiveScreenIds[i];
        if (orphanId && orphanId !== screenId) {
          try { await query(`DELETE FROM studio_screens WHERE id = $1`, [orphanId]); } catch { /* ok */ }
        }
      }
      screens = screens.slice(0, requestedCount);
      progressiveScreenIds.length = requestedCount;
      progressiveScreens.length = requestedCount;
    } else {
      await fail(
        `The model returned ${screens.length} screen(s) but you asked for exactly ${requestedCount}.`,
      );
      return;
    }
  }

  const allColors: string[] = [];
  for (const s of screens) {
    allColors.push(...extractPalette(s.ui_schema));
  }
  if (allColors.length > 0) {
    const unique = [...new Set(allColors)];
    onEvent({ type: "palette", colors: unique.slice(0, 12) });
  }

  const activeScreenIsDS = isDesignSystemScreenName(primaryNameFallback);
  let primaryIndex = 0;
  if (
    screens.length >= 2 &&
    isDesignSystemScreenName(screens[0].name) &&
    !isDesignSystemScreenName(screens[1].name) &&
    !activeScreenIsDS
  ) {
    primaryIndex = 1;
  }

  const primary = screens[primaryIndex];

  const orderedScreenIds: string[] = new Array(screens.length).fill("");
  orderedScreenIds[primaryIndex] = screenId;
  for (let i = 0; i < screens.length; i++) {
    if (progressiveScreenIds[i] && i !== primaryIndex) {
      orderedScreenIds[i] = progressiveScreenIds[i];
    }
  }

  if (primaryIndex > 0 && progressiveScreenIds[0] === screenId) {
    const extraRowId = progressiveScreenIds[primaryIndex];
    if (extraRowId && extraRowId !== screenId) {
      orderedScreenIds[0] = extraRowId;
    }
  }

  {
    const isDS = /design\s*system/i.test(primary.name);
    await query(
      `UPDATE studio_screens SET name = $3, ui_schema = $4${
        isDS ? `, width = ${DESKTOP_COMPANION_ARTBOARD.width}, height = ${DESKTOP_COMPANION_ARTBOARD.height}` : ""
      } WHERE id = $1 AND user_id = $2`,
      [screenId, user.id, primary.name.slice(0, 200), JSON.stringify(primary.ui_schema)],
    );
    onEvent({ type: "screen_ready", index: primaryIndex, name: primary.name, screenId });
  }

  const orderedSet = new Set(orderedScreenIds.filter(Boolean));
  orderedSet.add(screenId);
  const orphanIds: string[] = [];
  for (const pid of progressiveScreenIds) {
    if (pid && !orderedSet.has(pid)) orphanIds.push(pid);
  }
  if (orphanIds.length > 0) {
    try {
      for (const oid of orphanIds) {
        await query(`DELETE FROM studio_screens WHERE id = $1`, [oid]);
      }
    } catch (e) {
      console.error("[gen-stream] Orphan cleanup failed:", e);
    }
  }

  for (let i = 0; i < screens.length; i++) {
    if (i === primaryIndex) continue;
    const rowId = orderedScreenIds[i];
    if (!rowId) continue;
    const isDSRow = isDesignSystemScreenName(screens[i].name);
    await query(
      `UPDATE studio_screens SET name = $3, ui_schema = $4${
        isDSRow ? `, width = ${DESKTOP_COMPANION_ARTBOARD.width}, height = ${DESKTOP_COMPANION_ARTBOARD.height}` : ""
      } WHERE id = $1 AND user_id = $2`,
      [rowId, user.id, screens[i].name.slice(0, 200), JSON.stringify(screens[i].ui_schema)],
    );
  }

  if (refine && primaryIndex > 0 && !orderedScreenIds[0] && screens[0]) {
    const existingDS = await queryOne<{ id: string }>(
      `SELECT id FROM studio_screens
       WHERE project_id = $1 AND user_id = $2 AND id != $3 AND LOWER(name) LIKE '%design system%'
       LIMIT 1`,
      [job.project_id, user.id, screenId],
    );

    if (existingDS) {
      await query(
        `UPDATE studio_screens SET name = $3, ui_schema = $4, width = $5, height = $6
         WHERE id = $1 AND user_id = $2`,
        [
          existingDS.id,
          user.id,
          screens[0].name.slice(0, 200),
          JSON.stringify(screens[0].ui_schema),
          DESKTOP_COMPANION_ARTBOARD.width,
          DESKTOP_COMPANION_ARTBOARD.height,
        ],
      );
      orderedScreenIds[0] = existingDS.id;
      onEvent({ type: "screen_ready", index: 0, name: screens[0].name, screenId: existingDS.id });
    }
  }

  for (let i = 0; i < screens.length; i++) {
    if (orderedScreenIds[i] || i === primaryIndex) continue;
    await ensurePlaceX();
    await ensureSortBase();
    progressiveCreatedOrdinal += 1;
    const isDSGap = isDesignSystemScreenName(screens[i].name);
    const gW = isDSGap ? DESKTOP_COMPANION_ARTBOARD.width : extraW;
    const gH = isDSGap ? DESKTOP_COMPANION_ARTBOARD.height : extraH;
    const created = await createStudioScreen(job.project_id, {
      name: screens[i].name.slice(0, 200),
      ui_schema: screens[i].ui_schema,
      canvas_x: progressivePlaceX ?? 1000,
      canvas_y: baseY,
      width: gW,
      height: gH,
      sort_order: (progressiveSortBase ?? 0) + progressiveCreatedOrdinal,
    });
    if (created.ok) {
      orderedScreenIds[i] = created.data.id;
      onEvent({ type: "screen_ready", index: i, name: screens[i].name, screenId: created.data.id });
      progressivePlaceX = (progressivePlaceX ?? 1000) + gW + gap;
    }
  }

  const linkSync = await replacePrototypeLinksForScreens(
    user.id,
    orderedScreenIds,
    prototype_links,
  );
  if (!linkSync.ok) {
    onEvent({
      type: "status",
      message: `UI saved but prototype links failed: ${linkSync.error}`,
    });
  }

  const titleFromModel =
    typeof project_title === "string" && project_title.trim()
      ? project_title.trim().slice(0, 200)
      : null;

  const projectPatch: Record<string, unknown> = {};
  if (titleFromModel && !refine) projectPatch.name = titleFromModel;
  if (typeof design_md === "string" && design_md.trim().length > 0) {
    projectPatch.design_md = design_md;
  }
  if (Object.keys(projectPatch).length > 0) {
    const setClauses: string[] = [];
    const vals: unknown[] = [job.project_id, user.id];
    let idx = 3;
    for (const [k, v] of Object.entries(projectPatch)) {
      setClauses.push(`${k} = $${idx}`);
      vals.push(v);
      idx++;
    }
    await query(
      `UPDATE studio_projects SET ${setClauses.join(", ")} WHERE id = $1 AND user_id = $2`,
      vals,
    );
  }

  // ── AI Image Synthesis ──
  const imageNodesToGenerate = screens.flatMap((s, screenIdx) => {
    const html = getHtmlDocumentString(s.ui_schema);
    if (!html) return [];
    return collectImagePromptsFromHtml(html).map((n) => ({ ...n, screenIdx }));
  });

  if (imageNodesToGenerate.length > 0) {
    onEvent({
      type: "status",
      message: `Generating ${imageNodesToGenerate.length} image(s)…`,
    });

    let completed = 0;
    const imageProvider = await resolveImageSynthesisProviderForPipeline(
      jobModel,
      options?.pipeline,
    );

    const generateOneImage = async (
      node: (typeof imageNodesToGenerate)[number],
    ) => {
      try {
        onEvent({
          type: "image_progress",
          current: completed + 1,
          total: imageNodesToGenerate.length,
          prompt: node.imagePrompt.slice(0, 60),
        });

        const openAISize = inferOpenAIImageSize(node);
        const geminiCfg = inferGeminiImageSynthesisConfig(node);
        const grokPrompt = appendGrokCompositionHint(node.imagePrompt, node);

        const result = await generateImage(
          imageProvider,
          node.imagePrompt,
          {
            openAISize,
            geminiImageConfig: geminiCfg,
            ...(imageProvider === "xai" ?
              { promptForProvider: grokPrompt }
            : {}),
          },
        );

        const fileName = `${user.id}/${job.project_id}/${crypto.randomUUID()}.png`;
        const buffer = Buffer.from(result.base64, "base64");

        const dir = path.join(UPLOADS_DIR, user.id, job.project_id);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(UPLOADS_DIR, fileName), buffer);

        const imageUrl = `/uploads/${fileName}`;

        const screen = screens[node.screenIdx];
        replaceHtmlImageSrc(screen.ui_schema, node.nodeId, imageUrl);

        onEvent({ type: "image_done", nodeId: node.nodeId, url: imageUrl });
        completed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[image-synthesis] failed for node ${node.nodeId}:`, msg);
        const isKeyMissing = msg.includes("No API key");
        onEvent({
          type: "image_skipped",
          reason: isKeyMissing
            ? "Image generation skipped — no OpenAI, Google, or xAI API key configured. Add one in Settings."
            : `Image generation failed: ${msg.slice(0, 120)}`,
        });
      }
    };

    const batchSize = 8;
    for (let i = 0; i < imageNodesToGenerate.length; i += batchSize) {
      const batch = imageNodesToGenerate.slice(i, i + batchSize);
      await Promise.allSettled(batch.map(generateOneImage));
    }

    if (completed > 0) {
      await query(
        `UPDATE studio_screens SET ui_schema = $3 WHERE id = $1 AND user_id = $2`,
        [screenId, user.id, JSON.stringify(primary.ui_schema)],
      );

      for (let i = 0; i < screens.length; i++) {
        if (i === primaryIndex) continue;
        const sid = orderedScreenIds[i];
        if (!sid) continue;
        const screenImagesUpdated = imageNodesToGenerate.some(
          (n) => n.screenIdx === i,
        );
        if (!screenImagesUpdated) continue;

        await query(
          `UPDATE studio_screens SET ui_schema = $3 WHERE id = $1 AND user_id = $2`,
          [sid, user.id, JSON.stringify(screens[i].ui_schema)],
        );
      }

      onEvent({
        type: "status",
        message: `${completed} image(s) generated and embedded`,
      });
    }
  }

  const suggestions =
    modelSuggestions && modelSuggestions.length > 0
      ? modelSuggestions.slice(0, 4)
      : generateSuggestions(screens, job.prompt);
  if (suggestions.length > 0) {
    onEvent({ type: "suggestions", items: suggestions });
  }

  const resultPayload = {
    screens: screens.map((s) => ({
      name: s.name,
      ui_schema: JSON.parse(JSON.stringify(s.ui_schema)) as Record<string, unknown>,
    })),
  };

  const completedAt = new Date().toISOString();
  await query(
    `UPDATE studio_generation_jobs SET status = 'success', result_schema = $3, error_message = NULL, completed_at = $4
     WHERE id = $1 AND user_id = $2`,
    [jobId, user.id, JSON.stringify(resultPayload), completedAt],
  );

  const userMsg = await createStudioChatMessage(
    job.project_id,
    "user",
    job.prompt,
    screenId,
  );
  if (userMsg.ok) {
    const linkExtra =
      prototype_links.length > 0
        ? ` ${prototype_links.length} prototype link(s) between screens.`
        : "";
    const imgExtra =
      imageNodesToGenerate.length > 0
        ? ` ${imageNodesToGenerate.length} AI image(s) generated.`
        : "";
    const newScreenNames = screens
      .map((s, idx) => ({ name: s.name, idx }))
      .filter(({ idx }) => idx !== primaryIndex)
      .map(({ name }) => name);
    const extra =
      newScreenNames.length > 0
        ? ` Added ${newScreenNames.length} new screen(s): ${newScreenNames.join(", ")}.${linkExtra}${imgExtra}`
        : `${linkExtra}${imgExtra}`;
    const assistantSummary =
      focusedNode
        ? `${refine ? "Refined" : "Updated"} selected element "${focusId}" (${focusedNode.type}) on "${primary.name}".${extra}`
        : refine
          ? `Updated "${primary.name}" from your follow-up.${extra}`
          : `Generated "${primary.name}".${extra}`;
    await createStudioChatMessage(
      job.project_id,
      "assistant",
      assistantSummary,
      screenId,
    );
  }

  revalidatePath(`/project/${job.project_id}`);
  onEvent({
    type: "done",
    jobId,
    affectedScreenIds: orderedScreenIds,
  });
}
