import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStudioSharePayloadByToken } from "@/actions/studio/public-view";
import { PublicShareView } from "@/components/share/PublicShareView";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const res = await getStudioSharePayloadByToken(token);
  if (!res.ok) {
    return { title: "Shared project" };
  }
  return {
    title: `${res.data.project.name} · Shared`,
    description: `Read-only Studio preview: ${res.data.project.name}`,
  };
}

export default async function PublicShareViewPage({ params }: Props) {
  const { token } = await params;
  const res = await getStudioSharePayloadByToken(token);
  if (!res.ok) notFound();

  const { project, screens, prototypeLinks } = res.data;

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <header className="border-border/50 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="text-muted-foreground text-[0.65rem] font-semibold uppercase tracking-widest">
            Shared preview
          </p>
          <h1 className="truncate text-lg font-semibold tracking-tight">
            {project.name}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Studio home
          </Link>
        </div>
      </header>
      <PublicShareView
        project={project}
        screens={screens}
        prototypeLinks={prototypeLinks}
      />
    </div>
  );
}
