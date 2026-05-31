import { describe, it, expect } from 'vitest';
import { generatePalette } from '@/lib/ai/color-palette-generator';
import type { CustomPalette } from './palette-generator';

/**
 * Tests for palette generator component logic.
 * The UI rendering is not tested here (no jsdom environment),
 * but we validate the integration between generatePalette and
 * the CustomPalette data structure used by the component.
 *
 * Validates: Requirements 16.1, 16.3
 */

describe('PaletteGenerator integration', () => {
  describe('CustomPalette structure', () => {
    it('creates a valid CustomPalette from generated colors', () => {
      const description = 'warm sunset';
      const count = 8;
      const colors = generatePalette(description, count);

      const palette: CustomPalette = {
        id: crypto.randomUUID(),
        name: description,
        colors,
        createdAt: new Date().toISOString(),
      };

      expect(palette.id).toBeTruthy();
      expect(palette.name).toBe('warm sunset');
      expect(palette.colors).toHaveLength(8);
      expect(palette.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      palette.colors.forEach((color) => {
        expect(color).toMatch(/^#[0-9a-f]{6}$/);
      });
    });

    it('respects color count range (2-20)', () => {
      const colorsMin = generatePalette('ocean blue', 2);
      expect(colorsMin).toHaveLength(2);

      const colorsMax = generatePalette('ocean blue', 20);
      expect(colorsMax).toHaveLength(20);

      // Clamped below minimum
      const colorsBelowMin = generatePalette('ocean blue', 0);
      expect(colorsBelowMin).toHaveLength(2);

      // Clamped above maximum
      const colorsAboveMax = generatePalette('ocean blue', 25);
      expect(colorsAboveMax).toHaveLength(20);
    });

    it('generates different palettes for different descriptions', () => {
      const warmPalette = generatePalette('warm sunset', 5);
      const coolPalette = generatePalette('cool ocean', 5);

      // At least some colors should differ
      const allSame = warmPalette.every((c, i) => c === coolPalette[i]);
      expect(allSame).toBe(false);
    });

    it('handles empty description gracefully', () => {
      // generatePalette with empty string still produces colors (defaults to full spectrum)
      const colors = generatePalette('', 5);
      expect(colors).toHaveLength(5);
      colors.forEach((color) => {
        expect(color).toMatch(/^#[0-9a-f]{6}$/);
      });
    });
  });
});
