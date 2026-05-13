export function userBelongsToTeam(
  user: { teamId?: string; teamIds?: string[] } | null | undefined,
  teamId: string | null | undefined,
): boolean {
  if (!teamId || !user) return false;
  if (user.teamIds?.includes(teamId)) return true;
  return user.teamId === teamId;
}
