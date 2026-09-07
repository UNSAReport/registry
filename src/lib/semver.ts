import semver from 'semver';

/**
 * Checks whether a given string is a valid Semantic Versioning (SemVer) version string.
 *
 * @param version - Version string to validate.
 * @returns True if valid SemVer, false otherwise.
 */
export function isValidSemver(version: string): boolean {
  return semver.valid(version) !== null;
}

/**
 * Checks whether a given string is a valid Semantic Versioning (SemVer) range string.
 *
 * @param range - Version range string to validate.
 * @returns True if valid SemVer range, false otherwise.
 */
export function isValidSemverRange(range: string): boolean {
  return semver.validRange(range) !== null;
}

/**
 * Determines whether a version string satisfies a specified SemVer range requirement.
 *
 * @param version - SemVer version string to evaluate.
 * @param range - SemVer version range requirement.
 * @returns True if version satisfies the range, false otherwise.
 */
export function satisfiesSemver(version: string, range: string): boolean {
  return semver.satisfies(version, range);
}

/**
 * Finds the highest version from a list of version strings that satisfies a given SemVer range.
 *
 * @param versions - Array of SemVer version strings to evaluate.
 * @param range - SemVer range constraint to match.
 * @returns Highest matching SemVer version string, or null if no version matches.
 */
export function findHighestMatchingVersion(
  versions: string[],
  range: string,
): string | null {
  const matching = versions.filter((v) => semver.satisfies(v, range));
  if (matching.length === 0) return null;
  const sorted = semver.rsort(matching);
  return sorted[0];
}
