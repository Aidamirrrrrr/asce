import { Skeleton } from "@/components/ui/skeleton";

export function HomePageSkeleton() {
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="box-border flex min-h-full flex-col justify-center py-10 pt-16 sm:py-12 sm:pt-20 lg:py-14">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 sm:px-6">
          <div className="mx-auto w-full max-w-3xl space-y-4 text-center">
            <Skeleton className="mx-auto size-10 rounded-xl" />
            <Skeleton className="mx-auto h-10 w-2/3" />
            <Skeleton className="mx-auto h-5 w-full max-w-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </div>
          <div className="space-y-4">
            <div className="space-y-1">
              <Skeleton className="h-7 w-44" />
              <Skeleton className="h-4 w-full max-w-md" />
            </div>
            <div className="-mx-1 grid grid-cols-1 gap-4 px-1 py-0.5 lg:grid-cols-3">
              {(["preview-a", "preview-b", "preview-c"] as const).map((key) => (
                <Skeleton key={key} className="h-40 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
