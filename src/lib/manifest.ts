import { isValidSemver, isValidSemverRange } from '@/lib/semver';
import { ValidationError } from '@/middleware/error-handler';
import type { Manifest } from '@/types';

const NAME_REGEX = /^[a-z0-9]+([._-][a-z0-9]+)*$/;

export function validateManifest(
  rawManifest: unknown,
  uploadedFilePaths?: string[],
): Manifest {
  if (!rawManifest || typeof rawManifest !== 'object') {
    throw new ValidationError('Manifest must be a JSON object');
  }

  const manifest = rawManifest as Partial<Manifest>;

  // 1. name validation
  if (!manifest.name || typeof manifest.name !== 'string') {
    throw new ValidationError('Manifest field "name" is required', {
      field: 'name',
    });
  }

  const name = manifest.name.trim();
  if (name.length < 3 || name.length > 64) {
    throw new ValidationError(
      'Package name must be between 3 and 64 characters',
      { field: 'name' },
    );
  }

  if (!NAME_REGEX.test(name)) {
    throw new ValidationError(
      'Package name must be slug format (lowercase alphanumeric, dots, hyphens, underscores)',
      { field: 'name' },
    );
  }

  // 2. version validation
  if (!manifest.version || typeof manifest.version !== 'string') {
    throw new ValidationError('Manifest field "version" is required', {
      field: 'version',
    });
  }

  const version = manifest.version.trim();
  if (!isValidSemver(version)) {
    throw new ValidationError(`Invalid semver version: '${version}'`, {
      field: 'version',
    });
  }

  // 3. displayName validation
  let displayName = manifest.displayName;
  if (displayName !== undefined && displayName !== null) {
    if (typeof displayName !== 'string') {
      throw new ValidationError(
        'Manifest field "displayName" must be a string',
        { field: 'displayName' },
      );
    }
    displayName = displayName.trim();
    if (displayName.length < 1 || displayName.length > 128) {
      throw new ValidationError(
        'Manifest field "displayName" must be between 1 and 128 characters',
        { field: 'displayName' },
      );
    }
  }

  // 4. description validation
  let description = manifest.description;
  if (description !== undefined && description !== null) {
    if (typeof description !== 'string') {
      throw new ValidationError(
        'Manifest field "description" must be a string',
        { field: 'description' },
      );
    }
    description = description.trim();
    if (description.length > 2048) {
      throw new ValidationError(
        'Manifest field "description" max length is 2048 characters',
        { field: 'description' },
      );
    }
  }

  // 5. files validation
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new ValidationError(
      'Manifest field "files" must be a non-empty array',
      { field: 'files' },
    );
  }

  const files: string[] = [];
  for (const f of manifest.files) {
    if (typeof f !== 'string' || !f.trim()) {
      throw new ValidationError(
        'All elements in "files" array must be non-empty strings',
        { field: 'files' },
      );
    }
    const cleanPath = f.trim().replace(/^[/\\]+/, '');
    files.push(cleanPath);
  }

  // 6. entry validation
  let entry = manifest.entry;
  if (entry !== undefined && entry !== null) {
    if (typeof entry !== 'string') {
      throw new ValidationError('Manifest field "entry" must be a string', {
        field: 'entry',
      });
    }
    entry = entry.trim().replace(/^[/\\]+/, '');
    if (!files.includes(entry)) {
      throw new ValidationError(
        `Entry file "${entry}" must be listed in "files" array`,
        { field: 'entry' },
      );
    }
  }

  // 7. tags validation
  let tags: string[] | undefined;
  if (manifest.tags !== undefined && manifest.tags !== null) {
    if (!Array.isArray(manifest.tags)) {
      throw new ValidationError('Manifest field "tags" must be an array', {
        field: 'tags',
      });
    }
    tags = manifest.tags.map((t) => {
      if (typeof t !== 'string') {
        throw new ValidationError('Tag names must be strings', {
          field: 'tags',
        });
      }
      return t.trim().toLowerCase();
    });
  }

  // 8. dependencies validation
  let dependencies: Record<string, string> | undefined;
  if (manifest.dependencies !== undefined && manifest.dependencies !== null) {
    if (
      typeof manifest.dependencies !== 'object' ||
      Array.isArray(manifest.dependencies)
    ) {
      throw new ValidationError(
        'Manifest field "dependencies" must be an object',
        { field: 'dependencies' },
      );
    }
    dependencies = {};
    for (const [depName, range] of Object.entries(manifest.dependencies)) {
      if (typeof range !== 'string' || !isValidSemverRange(range)) {
        throw new ValidationError(
          `Invalid semver range: '${range}' is not a valid range`,
          { field: `dependencies.${depName}` },
        );
      }
      dependencies[depName.trim()] = range.trim();
    }
  }

  // 9. If uploaded file paths are provided, verify every manifest file is present
  if (uploadedFilePaths && uploadedFilePaths.length > 0) {
    for (const file of files) {
      if (!uploadedFilePaths.includes(file)) {
        throw new ValidationError(
          `Declared file "${file}" was not uploaded in multipart request`,
          { field: 'files' },
        );
      }
    }
  }

  return {
    name,
    version,
    displayName,
    description,
    entry,
    tags,
    dependencies,
    files,
  };
}
