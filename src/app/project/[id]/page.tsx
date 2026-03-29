import { notFound } from "next/navigation";
import { cache } from "react";

export const dynamic = "force-dynamic";
import { listStudioAssets } from "@/actions/studio/assets";
import { listStudioGenerationJobs } from "@/actions/studio/generation-jobs";
import { listStudioPrototypeLinksByProject } from "@/actions/studio/prototype-links";
import { getStudioProject } from "@/actions/studio/projects";
import {
  createStudioScreen,
  listStudioScreens,
} from "@/actions/studio/screens";
import { listStudioVariantsByProject } from "@/actions/studio/variants";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import type { StudioScreenRow } from "@/types/studio";

type Props = { params: Promise<{ id: string }> };

/**
 * Loads screens and ensures at least one artboard exists so the Prompt tab can
 * target a screen immediately (Generate stays disabled without `activeScreenId`).
 * `cache` dedupes within a single RSC pass (e.g. React Strict Mode dev double render).
 */
const loadScreensForProjectWorkspace = cache(async (projectId: string) => {
  const screensRes = await listStudioScreens(projectId);
  if (!screensRes.ok) {
    return {
      ok: false as const,
      error: screensRes.error,
      screens: [] as StudioScreenRow[],
    };
  }
  let screens = screensRes.data;
  if (screens.length === 0) {
    const seeded = await createStudioScreen(projectId, {
      name: "Screen 1",
      canvas_x: 1000,
      canvas_y: 80,
      sort_order: 0,
    });
    if (seeded.ok) screens = [seeded.data];
  }
  return { ok: true as const, error: undefined as string | undefined, screens };
});

export default async function ProjectWorkspacePage({ params }: Props) {
  const { id } = await params;
  const result = await getStudioProject(id);

  if (!result.ok) notFound();

  const project = result.data;
  const screensPayload = await loadScreensForProjectWorkspace(id);
  if (!screensPayload.ok) notFound();
  const screens = screensPayload.screens;
  const jobsRes = await listStudioGenerationJobs(id);
  const initialGenerationJobs = jobsRes.ok ? jobsRes.data : [];

  const [assetsRes, variantsRes, protoRes] = await Promise.all([
    listStudioAssets(id),
    listStudioVariantsByProject(id),
    listStudioPrototypeLinksByProject(id),
  ]);

  const initialLibrary = {
    assets: assetsRes.ok ? assetsRes.data : [],
    variants: variantsRes.ok ? variantsRes.data : [],
    prototypeLinks: protoRes.ok ? protoRes.data : [],
  };

  return (
    <WorkspaceShell
      key={project.id}
      initialProject={project}
      initialScreens={screens}
      initialGenerationJobs={initialGenerationJobs}
      initialLibrary={initialLibrary}
    />
  );
}
