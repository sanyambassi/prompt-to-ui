import { WelcomeShell } from "@/components/home/WelcomeShell";
import { query } from "@/lib/db/pool";
import { getUser } from "@/lib/auth/anonymous-user";
import type { StudioProjectRow } from "@/types/studio";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let projects: StudioProjectRow[] = [];

  try {
    const user = getUser();
    const { rows } = await query<StudioProjectRow>(
      `SELECT * FROM studio_projects WHERE user_id = $1 ORDER BY updated_at DESC`,
      [user.id],
    );
    projects = rows;
  } catch {
    /* DB may not be ready yet */
  }

  return <WelcomeShell initialProjects={projects} />;
}
