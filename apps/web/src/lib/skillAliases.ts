/** Aliases stored on skill.metadata.aliases after a merge. */

export function skillAliasesFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): string[] {
  const raw = metadata?.aliases;
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}
