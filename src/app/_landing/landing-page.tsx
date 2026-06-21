import { LandingContent } from "@/app/_landing/landing-content";
import { getMaxBetaUsers } from "@/lib/beta";

export function LandingPage() {
  return <LandingContent maxBetaUsers={getMaxBetaUsers()} />;
}
