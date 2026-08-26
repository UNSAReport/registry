import semver from 'semver';

export function isValidSemver(version: string): boolean {
  return semver.valid(version) !== null;
}

export function isValidSemverRange(range: string): boolean {
  return semver.validRange(range) !== null;
}

export function satisfiesSemver(version: string, range: string): boolean {
  return semver.satisfies(version, range);
}

export function findHighestMatchingVersion(
  versions: string[],
  range: string,
): string | null {
  const matching = versions.filter((v) => semver.satisfies(v, range));
  if (matching.length === 0) return null;
  const sorted = semver.rsort(matching);
  return sorted[0];
}
