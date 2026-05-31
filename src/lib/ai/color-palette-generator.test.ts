import { describe, it, expect } from 'vitest';
import {
  generatePalette,
  checkContrast,
  hslToHex,
  hexToHsl,
  parseKeywords,
  mapKeywordsToHues,
  extractMoodModifiers,
  relativeLuminance,
} from './color-palette-generator';

describe('hslToHex', () => {
  it('converts pure red', () => {
    expect(hslToHex(0, 100, 50)).toBe('#ff0000');
  });

  it('converts pure green', () => {
    expect(hslToHex(120, 100, 50)).toBe('#00ff00');
  });

  it('converts pure blue', () => {
    expect(hslToHex(240, 100, 50)).toBe('#0000ff');
  });

  it('converts white', () => {
    expect(hslToHex(0, 0, 100)).toBe('#ffffff');
  });

  it('converts black', () => {
    expect(hslToHex(0, 0, 0)).toBe('#000000');
  });

  it('converts mid-gray', () => {
    expect(hslToHex(0, 0, 50)).toBe('#808080');
  });

  it('converts a teal color', () => {
    const hex = hslToHex(180, 100, 50);
    expect(hex).toBe('#00ffff');
  });
});

describe('hexToHsl', () => {
  it('converts pure red', () => {
    const [h, s, l] = hexToHsl('#ff0000');
    expect(h).toBe(0);
    expect(s).toBe(100);
    expect(l).toBe(50);
  });

  it('converts pure green', () => {
    const [h, s, l] = hexToHsl('#00ff00');
    expect(h).toBe(120);
    expect(s).toBe(100);
    expect(l).toBe(50);
  });

  it('converts pure blue', () => {
    const [h, s, l] = hexToHsl('#0000ff');
    expect(h).toBe(240);
    expect(s).toBe(100);
    expect(l).toBe(50);
  });

  it('converts white', () => {
    const [h, s, l] = hexToHsl('#ffffff');
    expect(s).toBe(0);
    expect(l).toBe(100);
  });

  it('converts black', () => {
    const [h, s, l] = hexToHsl('#000000');
    expect(s).toBe(0);
    expect(l).toBe(0);
  });

  it('handles hex without hash prefix', () => {
    const [h, s, l] = hexToHsl('ff0000');
    expect(h).toBe(0);
    expect(s).toBe(100);
    expect(l).toBe(50);
  });

  it('round-trips with hslToHex', () => {
    const original = '#3a7bd5';
    const [h, s, l] = hexToHsl(original);
    const result = hslToHex(h, s, l);
    // Allow small rounding differences
    const [rh, rs, rl] = hexToHsl(result);
    expect(Math.abs(rh - h)).toBeLessThanOrEqual(1);
    expect(Math.abs(rs - s)).toBeLessThanOrEqual(1);
    expect(Math.abs(rl - l)).toBeLessThanOrEqual(1);
  });
});

describe('relativeLuminance', () => {
  it('returns 1 for white', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 2);
  });

  it('returns 0 for black', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 2);
  });

  it('returns value between 0 and 1 for mid-gray', () => {
    const lum = relativeLuminance('#808080');
    expect(lum).toBeGreaterThan(0);
    expect(lum).toBeLessThan(1);
  });
});

describe('checkContrast', () => {
  it('returns 21:1 for black vs white', () => {
    const result = checkContrast('#000000', '#ffffff');
    expect(result.ratio).toBeCloseTo(21, 0);
    expect(result.passes).toBe(true);
  });

  it('returns 1:1 for same color', () => {
    const result = checkContrast('#336699', '#336699');
    expect(result.ratio).toBe(1);
    expect(result.passes).toBe(false);
  });

  it('detects insufficient contrast between similar colors', () => {
    const result = checkContrast('#666666', '#777777');
    expect(result.passes).toBe(false);
  });

  it('detects sufficient contrast between distinct colors', () => {
    const result = checkContrast('#000000', '#808080');
    expect(result.passes).toBe(true);
  });

  it('is symmetric (order does not matter)', () => {
    const result1 = checkContrast('#ff0000', '#0000ff');
    const result2 = checkContrast('#0000ff', '#ff0000');
    expect(result1.ratio).toBe(result2.ratio);
    expect(result1.passes).toBe(result2.passes);
  });

  it('passes for WCAG AA 3:1 minimum', () => {
    // Dark blue vs light blue should have good contrast
    const result = checkContrast('#003366', '#99ccff');
    expect(result.ratio).toBeGreaterThanOrEqual(3);
    expect(result.passes).toBe(true);
  });
});

describe('parseKeywords', () => {
  it('splits description into lowercase words', () => {
    expect(parseKeywords('Ocean Blue Professional')).toEqual([
      'ocean',
      'blue',
      'professional',
    ]);
  });

  it('handles hyphens and underscores as separators', () => {
    expect(parseKeywords('warm-sunset_gradient')).toEqual([
      'warm',
      'sunset',
      'gradient',
    ]);
  });

  it('filters out single-character words', () => {
    expect(parseKeywords('a warm b sunset')).toEqual(['warm', 'sunset']);
  });

  it('handles empty string', () => {
    expect(parseKeywords('')).toEqual([]);
  });

  it('trims whitespace', () => {
    expect(parseKeywords('  ocean blue  ')).toEqual(['ocean', 'blue']);
  });
});

describe('mapKeywordsToHues', () => {
  it('maps warm to hue range 0-60', () => {
    const ranges = mapKeywordsToHues(['warm']);
    expect(ranges).toContainEqual([0, 60]);
  });

  it('maps ocean to hue range 190-230', () => {
    const ranges = mapKeywordsToHues(['ocean']);
    expect(ranges).toContainEqual([190, 230]);
  });

  it('maps multiple keywords to multiple ranges', () => {
    const ranges = mapKeywordsToHues(['warm', 'blue']);
    expect(ranges.length).toBe(2);
  });

  it('returns full spectrum for unrecognized keywords', () => {
    const ranges = mapKeywordsToHues(['xyz', 'unknown']);
    expect(ranges).toContainEqual([0, 360]);
  });

  it('returns full spectrum for empty keywords', () => {
    const ranges = mapKeywordsToHues([]);
    expect(ranges).toContainEqual([0, 360]);
  });
});

describe('extractMoodModifiers', () => {
  it('returns pastel modifiers for pastel keyword', () => {
    const mods = extractMoodModifiers(['pastel']);
    expect(mods.saturation[0]).toBeLessThan(mods.saturation[1]);
    expect(mods.lightness[0]).toBeGreaterThanOrEqual(75);
  });

  it('returns vibrant modifiers for vibrant keyword', () => {
    const mods = extractMoodModifiers(['vibrant']);
    expect(mods.saturation[0]).toBeGreaterThanOrEqual(75);
  });

  it('returns default modifiers for unrecognized keywords', () => {
    const mods = extractMoodModifiers(['unknown']);
    expect(mods.saturation).toEqual([50, 80]);
    expect(mods.lightness).toEqual([35, 65]);
  });
});

describe('generatePalette', () => {
  it('generates default 8 colors', () => {
    const palette = generatePalette('ocean blue');
    expect(palette).toHaveLength(8);
  });

  it('generates specified number of colors', () => {
    const palette = generatePalette('warm sunset', 5);
    expect(palette).toHaveLength(5);
  });

  it('clamps count to minimum of 2', () => {
    const palette = generatePalette('red', 0);
    expect(palette).toHaveLength(2);
  });

  it('clamps count to maximum of 20', () => {
    const palette = generatePalette('blue', 50);
    expect(palette).toHaveLength(20);
  });

  it('returns valid hex color strings', () => {
    const palette = generatePalette('forest green', 6);
    const hexRegex = /^#[0-9a-f]{6}$/;
    for (const color of palette) {
      expect(color).toMatch(hexRegex);
    }
  });

  it('generates distinct colors', () => {
    const palette = generatePalette('vibrant rainbow', 8);
    const unique = new Set(palette);
    // At least most colors should be distinct
    expect(unique.size).toBeGreaterThanOrEqual(palette.length - 1);
  });

  it('adjacent colors meet WCAG AA 3:1 contrast ratio', () => {
    const palette = generatePalette('ocean blue professional', 8);
    for (let i = 0; i < palette.length - 1; i++) {
      const { ratio } = checkContrast(palette[i], palette[i + 1]);
      expect(ratio).toBeGreaterThanOrEqual(3.0);
    }
  });

  it('warm description produces warm-hued colors', () => {
    const palette = generatePalette('warm sunset', 5);
    // Check that at least some colors are in the warm hue range
    let warmCount = 0;
    for (const color of palette) {
      const [h] = hexToHsl(color);
      if ((h >= 0 && h <= 60) || h >= 330) {
        warmCount++;
      }
    }
    expect(warmCount).toBeGreaterThan(0);
  });

  it('cool description produces cool-hued colors', () => {
    const palette = generatePalette('cool ocean blue', 5);
    let coolCount = 0;
    for (const color of palette) {
      const [h] = hexToHsl(color);
      if (h >= 170 && h <= 270) {
        coolCount++;
      }
    }
    expect(coolCount).toBeGreaterThan(0);
  });

  it('handles empty description gracefully', () => {
    const palette = generatePalette('', 5);
    expect(palette).toHaveLength(5);
    const hexRegex = /^#[0-9a-f]{6}$/;
    for (const color of palette) {
      expect(color).toMatch(hexRegex);
    }
  });

  it('pastel modifier produces lighter colors', () => {
    const palette = generatePalette('pastel blue', 5);
    // Most pastel colors should be on the lighter side
    let lightCount = 0;
    for (const color of palette) {
      const [, , l] = hexToHsl(color);
      if (l >= 40) lightCount++;
    }
    // At least 3 out of 5 should be light (some may be adjusted for contrast)
    expect(lightCount).toBeGreaterThanOrEqual(3);
  });

  it('dark modifier produces darker colors', () => {
    const palette = generatePalette('dark blue', 5);
    // Most dark colors should have lower lightness
    let darkCount = 0;
    for (const color of palette) {
      const [, , l] = hexToHsl(color);
      if (l <= 70) darkCount++;
    }
    // At least 3 out of 5 should be dark (some may be adjusted for contrast)
    expect(darkCount).toBeGreaterThanOrEqual(3);
  });

  it('contrast check passes for various descriptions', () => {
    const descriptions = [
      'warm sunset gradient',
      'forest green natural',
      'purple elegant',
      'vibrant tropical',
      'muted earth tones',
    ];

    for (const desc of descriptions) {
      const palette = generatePalette(desc, 6);
      for (let i = 0; i < palette.length - 1; i++) {
        const { ratio } = checkContrast(palette[i], palette[i + 1]);
        expect(ratio).toBeGreaterThanOrEqual(3.0);
      }
    }
  });
});
