import { describe, expect, it } from 'bun:test';
import { validateManifest } from '@/lib/manifest';
import { ValidationError } from '@/middleware/error-handler';

describe('Manifest Validation', () => {
  it('should validate a valid manifest', () => {
    const manifest = {
      name: 'typst-table-pro',
      version: '1.2.0',
      displayName: 'Typst Table Pro',
      description: 'Advanced table templates for Typst',
      entry: 'table.typ',
      tags: ['document', 'tables'],
      dependencies: {
        'typst-utils': '>=1.0.0',
        'typst-chart-kit': '^2.0.0',
      },
      files: ['table.typ', 'helpers.typ', 'README.md'],
    };

    const validated = validateManifest(manifest, [
      'table.typ',
      'helpers.typ',
      'README.md',
    ]);
    expect(validated.name).toBe('typst-table-pro');
    expect(validated.version).toBe('1.2.0');
    expect(validated.files).toHaveLength(3);
  });

  it('should reject manifest with invalid package name', () => {
    const manifest = {
      name: 'Invalid_Name_With_UPPERCASE!',
      version: '1.0.0',
      files: ['index.typ'],
    };

    expect(() => validateManifest(manifest)).toThrow(ValidationError);
  });

  it('should reject manifest with invalid semver', () => {
    const manifest = {
      name: 'valid-name',
      version: 'invalid-version',
      files: ['index.typ'],
    };

    expect(() => validateManifest(manifest)).toThrow(ValidationError);
  });

  it('should reject manifest where entry is not in files list', () => {
    const manifest = {
      name: 'valid-name',
      version: '1.0.0',
      entry: 'missing.typ',
      files: ['index.typ'],
    };

    expect(() => validateManifest(manifest)).toThrow(ValidationError);
  });

  it('should reject manifest when declared file is missing in uploaded files', () => {
    const manifest = {
      name: 'valid-name',
      version: '1.0.0',
      files: ['index.typ', 'extra.typ'],
    };

    expect(() => validateManifest(manifest, ['index.typ'])).toThrow(
      ValidationError,
    );
  });
});
