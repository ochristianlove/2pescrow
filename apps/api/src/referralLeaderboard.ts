import { prisma } from "./db";

export function referrerLeaderboardLabel(displayName: string | null | undefined): string {
  const name = displayName?.trim();
  return name || "A referrer";
}

export async function referralLeaderboardEntries(limit = 50) {
  const referrers = await prisma.referrer.findMany({
    include: { user: { select: { displayName: true } } },
  });

  return referrers
    .filter((r) => BigInt(r.totalEarnedAtomic || "0") > 0n)
    .sort((a, b) => {
      const diff = BigInt(b.totalEarnedAtomic || "0") - BigInt(a.totalEarnedAtomic || "0");
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    })
    .slice(0, limit)
    .map((r, index) => ({
      rank: index + 1,
      displayLabel: referrerLeaderboardLabel(r.user.displayName),
      tier: r.tier,
      totalEarnedAtomic: r.totalEarnedAtomic,
      successfulReferrals: r.successfulReferrals,
    }));
}
