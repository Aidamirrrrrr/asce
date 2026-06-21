import { getOwnedProject, requireUser } from "@/lib/auth/session";
import { listProjectCollections, listProjectRecords } from "@/lib/bot/project-records";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const authResult = await requireUser();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await context.params;
  const owned = await getOwnedProject(authResult.userId, id);
  if ("error" in owned) {
    return owned.error;
  }

  const url = new URL(request.url);
  const collection = url.searchParams.get("collection")?.trim() || undefined;

  const [collections, records] = await Promise.all([
    listProjectCollections(id),
    listProjectRecords({ projectId: id, collection, limit: 200 }),
  ]);

  return Response.json({ collections, records });
}
