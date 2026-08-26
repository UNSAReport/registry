import { describe, expect, it } from 'bun:test';
import {
  findHighestMatchingVersion,
  isValidSemver,
  isValidSemverRange,
  satisfiesSemver,
} from '@/lib/semver';

describe('Semver Utilities', () => {
  it('should correctly identify valid semver versions', () => {
    expect(isValidSemver('1.0.0')).toBe(true);
    expect(isValidSemver('0.1.0-beta.1')).toBe(true);
    expect(isValidSemver('2.3.4+build.100')).toBe(true);
    expect(isValidSemver('invalid')).toBe(false);
  });

  it('should correctly identify valid semver ranges', () => {
    expect(isValidSemverRange('>=1.0.0')).toBe(true);
    expect(isValidSemverRange('^2.1.0')).toBe(true);
    expect(isValidSemverRange('~1.2.3')).toBe(true);
    expect(isValidSemverRange('invalid-range')).toBe(false);
  });

  it('should check if version satisfies range', () => {
    expect(satisfiesSemver('1.2.3', '^1.0.0')).toBe(true);
    expect(satisfiesSemver('2.0.0', '^1.0.0')).toBe(false);
  });

  it('should pick highest matching version from list', () => {
    const versions = ['1.0.0', '1.1.0', '1.2.0', '2.0.0'];
    expect(findHighestMatchingVersion(versions, '^1.0.0')).toBe('1.2.0');
    expect(findHighestMatchingVersion(versions, '>=2.0.0')).toBe('2.0.0');
    expect(findHighestMatchingVersion(versions, '^3.0.0')).toBeNull();
  });
});
