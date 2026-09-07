import { eq } from 'drizzle-orm';
import { db } from '@/db';
import {
  packageDependencies,
  packageFiles,
  packages,
  packageVersions,
} from '@/db/schema';
import { getPresignedUrl } from '@/lib/s3';
import { findHighestMatchingVersion, satisfiesSemver } from '@/lib/semver';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/middleware/error-handler';
import type { ResolvedPackage } from '@/types';

/**
 * Fetches declared dependency names and version ranges for a given package version ID.
 *
 * @param versionId - Unique identifier of the package version.
 * @returns Array of dependency records containing dependencyName and versionRange.
 */
async function getVersionDependencies(versionId: string) {
  return await db
    .select({
      dependencyName: packageDependencies.dependencyName,
      versionRange: packageDependencies.versionRange,
    })
    .from(packageDependencies)
    .where(eq(packageDependencies.versionId, versionId));
}

/**
 * Traverses dependency trees of existing packages to detect circular dependency chains involving a newly uploaded package.
 *
 * @param uploadPackageName - Name of the package being uploaded.
 * @param declaredDependencies - Key-value map of declared dependency names to SemVer ranges.
 * @throws ValidationError if a circular dependency cycle is detected.
 */
export async function checkCircularDependencies(
  uploadPackageName: string,
  declaredDependencies: Record<string, string>,
): Promise<void> {
  const queue: { name: string; path: string[] }[] = [];

  for (const depName of Object.keys(declaredDependencies)) {
    if (depName === uploadPackageName) {
      throw new ValidationError(
        `Circular dependency detected: package '${uploadPackageName}' cannot depend on itself`,
      );
    }
    queue.push({ name: depName, path: [uploadPackageName, depName] });
  }

  const visited = new Set<string>();

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) continue;

    if (visited.has(item.name)) continue;
    visited.add(item.name);

    const approvedVers = await db
      .select({
        versionId: packageVersions.id,
      })
      .from(packageVersions)
      .innerJoin(packages, eq(packageVersions.packageId, packages.id))
      .where(eq(packages.name, item.name));

    for (const ver of approvedVers) {
      const deps = await getVersionDependencies(ver.versionId);
      for (const dep of deps) {
        if (dep.dependencyName === uploadPackageName) {
          const cyclePath = [...item.path, uploadPackageName].join(' -> ');
          throw new ValidationError(
            `Circular dependency detected: ${cyclePath}`,
          );
        }
        if (!visited.has(dep.dependencyName)) {
          queue.push({
            name: dep.dependencyName,
            path: [...item.path, dep.dependencyName],
          });
        }
      }
    }
  }
}

/**
 * Resolves an initial set of package requirements and SemVer ranges into a flattened, conflict-free dependency resolution tree.
 *
 * @param initialPackages - Map of initial package names to requested SemVer range strings.
 * @returns Array of resolved package metadata objects including presigned download URLs and file lists.
 * @throws NotFoundError if a package or version cannot be found.
 * @throws ConflictError if dependency ranges cannot be satisfied.
 * @throws ValidationError if a circular dependency loop is encountered.
 */
export async function resolveDependencyTree(
  initialPackages: Record<string, string>,
): Promise<ResolvedPackage[]> {
  const constraints = new Map<string, string[]>();
  const queue: { name: string; path: string[] }[] = [];

  for (const [name, range] of Object.entries(initialPackages)) {
    constraints.set(name, [range]);
    queue.push({ name, path: [name] });
  }

  const resolvedMap = new Map<
    string,
    { version: string; versionId: string; archiveS3Key: string }
  >();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const { name, path } = current;

    const ranges = constraints.get(name) || [];

    const statusApprovedRows = await db
      .select({
        versionId: packageVersions.id,
        version: packageVersions.version,
        archiveS3Key: packageVersions.archiveS3Key,
        status: packageVersions.status,
      })
      .from(packageVersions)
      .innerJoin(packages, eq(packageVersions.packageId, packages.id))
      .where(eq(packages.name, name));

    const approvedRows = statusApprovedRows.filter(
      (r) => r.status === 'approved',
    );

    if (approvedRows.length === 0) {
      throw new NotFoundError(
        `Package '${name}' not found or has no approved versions`,
      );
    }

    const availableVersionStrings = approvedRows.map((r) => r.version);
    const matchingVersions = availableVersionStrings.filter((v) =>
      ranges.every((r) => satisfiesSemver(v, r)),
    );

    if (matchingVersions.length === 0) {
      throw new ConflictError(
        `Dependency conflict: no approved version of package '${name}' satisfies ranges [${ranges.join(', ')}]`,
      );
    }

    const highestVersion = findHighestMatchingVersion(matchingVersions, '*');
    if (!highestVersion) {
      throw new ConflictError(
        `Dependency conflict: unable to determine highest matching version for '${name}'`,
      );
    }

    const selectedVersionRow = approvedRows.find(
      (r) => r.version === highestVersion,
    );
    if (!selectedVersionRow) {
      throw new ConflictError(
        `Selected version row not found for version '${highestVersion}'`,
      );
    }

    const existingChoice = resolvedMap.get(name);
    if (
      existingChoice &&
      existingChoice.version === selectedVersionRow.version
    ) {
      continue;
    }

    resolvedMap.set(name, {
      version: selectedVersionRow.version,
      versionId: selectedVersionRow.versionId,
      archiveS3Key: selectedVersionRow.archiveS3Key,
    });

    const dependencies = await getVersionDependencies(
      selectedVersionRow.versionId,
    );

    for (const dep of dependencies) {
      const depName = dep.dependencyName;
      const depRange = dep.versionRange;

      if (path.includes(depName)) {
        const cycle = [...path, depName].join(' -> ');
        throw new ValidationError(
          `Circular dependency detected in resolution tree: ${cycle}`,
        );
      }

      const existingRanges = constraints.get(depName) || [];
      if (!existingRanges.includes(depRange)) {
        constraints.set(depName, [...existingRanges, depRange]);
        queue.push({ name: depName, path: [...path, depName] });
      }
    }
  }

  const result: ResolvedPackage[] = [];

  for (const [name, info] of resolvedMap.entries()) {
    const filesRows = await db
      .select({ path: packageFiles.path })
      .from(packageFiles)
      .where(eq(packageFiles.versionId, info.versionId));

    const filePaths = filesRows.map((f) => f.path);
    const archiveUrl = await getPresignedUrl(info.archiveS3Key);

    result.push({
      name,
      version: info.version,
      archive_url: archiveUrl,
      files: filePaths,
    });
  }

  return result;
}
