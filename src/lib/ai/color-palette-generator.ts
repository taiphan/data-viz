/**
 * AI Color Palette Generator
 *
 * Generates accessible color palettes from text descriptions using
 * HSL manipulation and WCAG AA contrast checking.
 * Runs entirely client-side — no external API required.
 *
 * Requirements: 16.1, 16.2, 16.4
 */

// Keyword-to-hue mapping ranges (HSL hue degrees)
const KEYWORD_HUE_MAP: Record<string, [number, number]> = {
  // Warm tones
  warm: [0, 60],
  hot: [0, 30],
  fire: [0, 30],
  sunset: [10, 50],
  autumn: [20, 50],
  fall: [20, 50],
  orange: [20, 40],
  red: [0, 15],
  coral: [5, 20],
  peach: [15, 35],
  gold: [40, 55],
  yellow: [50, 65],
  amber: [35, 50],

  // Cool tones
  cool: [180, 270],
  cold: [200, 250],
  ice: [190, 220],
  ocean: [190, 230],
  sea: [180, 220],
  water: [190, 230],
  blue: [210, 250],
  sky: [195, 220],
  navy: [220, 240],
  teal: [170, 195],
  cyan: [175, 195],
  aqua: [175, 200],

  // Earth tones
  earth: [20, 50],
  natural: [30, 90],
  forest: [100, 150],
  green: [100, 150],
  olive: [70, 100],
  moss: [80, 120],
  sage: [100, 140],
  mint: [140, 170],
  emerald: [140, 165],
  lime: [75, 100],

  // Purple/Violet
  purple: [270, 310],
  violet: [270, 300],
  lavender: [260, 290],
  plum: [290, 320],
  magenta: [300, 330],
  pink: [320, 350],
  rose: [330, 355],
  berry: [310, 340],
  fuchsia: [300, 330],

  // Neutral/Monochrome
  neutral: [0, 360],
  monochrome: [0, 0],
  gray: [0, 0],
  grey: [0, 0],
  dark: [0, 360],
  light: [0, 360],

  // Mood-based
  professional: [200, 240],
  corporate: [210, 240],
  elegant: [260, 300],
  vibrant: [0, 360],
  pastel: [0, 360],
  muted: [0, 360],
  bold: [0, 360],
  soft: [0, 360],
  bright: [0, 360],
  tropical: [100, 200],
  desert: [20, 50],
  winter: [190, 240],
  spring: [80, 160],
  summer: [30, 80],
};

// Saturation/lightness modifiers based on mood keywords
const MOOD_MODIFIERS: Record<string, { saturation: [number, number]; lightness: [number, number] }> = {
  pastel: { saturation: [40, 60], lightness: [75, 90] },
  muted: { saturation: [20, 45], lightness: [40, 60] },
  vibrant: { saturation: [75, 100], lightness: [45, 60] },
  bold: { saturation: [70, 100], lightness: [35, 55] },
  soft: { saturation: [30, 55], lightness: [65, 80] },
  bright: { saturation: [70, 95], lightness: [55, 70] },
  dark: { saturation: [50, 80], lightness: [20, 40] },
  light: { saturation: [40, 70], lightness: [70, 88] },
  professional: { saturation: [35, 65], lightness: [35, 55] },
  elegant: { saturation: [30, 60], lightness: [30, 50] },
};

const DEFAULT_SATURATION: [number, number] = [50, 80];
const DEFAULT_LIGHTNESS: [number, number] = [35, 65];
const MIN_CONTRAST_RATIO = 3.0; // WCAG AA for large text / UI components
const MAX_ADJUSTMENT_ATTEMPTS = 20;

/**
 * Parse keywords from a description string.
 */
export function parseKeywords(description: string): string[] {
  const normalized = description.toLowerCase().trim();
  const words = normalized.split(/[\s,\-_]+/).filter(Boolean);
  return words.filter((word) => word.length > 1);
}

/**
 * Map parsed keywords to HSL base hue ranges.
 */
export function mapKeywordsToHues(keywords: string[]): [number, number][] {
  const hueRanges: [number, number][] = [];

  for (const keyword of keywords) {
    if (KEYWORD_HUE_MAP[keyword]) {
      hueRanges.push(KEYWORD_HUE_MAP[keyword]);
    }
  }

  // Default to full spectrum if no keywords matched
  if (hueRanges.length === 0) {
    hueRanges.push([0, 360]);
  }

  return hueRanges;
}

/**
 * Extract mood modifiers from keywords.
 */
export function extractMoodModifiers(
  keywords: string[]
): { saturation: [number, number]; lightness: [number, number] } {
  for (const keyword of keywords) {
    if (MOOD_MODIFIERS[keyword]) {
      return MOOD_MODIFIERS[keyword];
    }
  }

  return { saturation: DEFAULT_SATURATION, lightness: DEFAULT_LIGHTNESS };
}

/**
 * Convert HSL values to hex color string.
 * @param h - Hue (0-360)
 * @param s - Saturation (0-100)
 * @param l - Lightness (0-100)
 */
export function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;

  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (h >= 0 && h < 60) {
    r = c; g = x; b = 0;
  } else if (h >= 60 && h < 120) {
    r = x; g = c; b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0; g = c; b = x;
  } else if (h >= 180 && h < 240) {
    r = 0; g = x; b = c;
  } else if (h >= 240 && h < 300) {
    r = x; g = 0; b = c;
  } else if (h >= 300 && h < 360) {
    r = c; g = 0; b = x;
  }

  const toHex = (value: number): string => {
    const hex = Math.round((value + m) * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Convert hex color string to HSL values.
 * @returns [h, s, l] where h is 0-360, s is 0-100, l is 0-100
 */
export function hexToHsl(hex: string): [number, number, number] {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        break;
      case g:
        h = ((b - r) / d + 2) * 60;
        break;
      case b:
        h = ((r - g) / d + 4) * 60;
        break;
    }
  }

  return [Math.round(h) % 360, Math.round(s * 100), Math.round(l * 100)];
}

/**
 * Calculate relative luminance of a color (WCAG 2.1 formula).
 */
export function relativeLuminance(hex: string): number {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const linearize = (c: number): number =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * Calculate WCAG contrast ratio between two colors.
 * Returns ratio and whether it passes WCAG AA (3:1 minimum).
 */
export function checkContrast(
  color1: string,
  color2: string
): { ratio: number; passes: boolean } {
  const l1 = relativeLuminance(color1);
  const l2 = relativeLuminance(color2);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  const ratio = (lighter + 0.05) / (darker + 0.05);

  return {
    ratio: Math.round(ratio * 100) / 100,
    passes: ratio >= MIN_CONTRAST_RATIO,
  };
}

/**
 * Generate evenly distributed hues within the given ranges.
 */
function distributeHues(hueRanges: [number, number][], count: number): number[] {
  const hues: number[] = [];

  if (hueRanges.length === 1) {
    const [min, max] = hueRanges[0];
    const range = max - min;

    if (range === 0) {
      // Monochrome — all same hue
      for (let i = 0; i < count; i++) {
        hues.push(min);
      }
    } else {
      const step = range / count;
      for (let i = 0; i < count; i++) {
        hues.push((min + step * i + step / 2) % 360);
      }
    }
  } else {
    // Distribute across multiple ranges
    const colorsPerRange = Math.ceil(count / hueRanges.length);
    for (const [min, max] of hueRanges) {
      const range = max - min;
      const step = range / colorsPerRange;
      for (let i = 0; i < colorsPerRange && hues.length < count; i++) {
        hues.push((min + step * i + step / 2) % 360);
      }
    }
  }

  return hues.slice(0, count);
}

/**
 * Adjust lightness of a color to meet contrast requirements with a neighbor.
 */
function adjustColorForContrast(
  color: string,
  neighbor: string,
  direction: 'lighter' | 'darker'
): string {
  const [h, s, l] = hexToHsl(color);
  const step = direction === 'lighter' ? 5 : -5;
  let newL = l;

  for (let attempt = 0; attempt < MAX_ADJUSTMENT_ATTEMPTS; attempt++) {
    newL = Math.max(5, Math.min(95, newL + step));
    const adjusted = hslToHex(h, s, newL);
    const { passes } = checkContrast(adjusted, neighbor);

    if (passes) {
      return adjusted;
    }
  }

  // Return best effort
  return hslToHex(h, s, newL);
}

/**
 * Ensure all adjacent color pairs meet WCAG AA contrast.
 * Uses alternating lightness strategy to maximize contrast.
 */
function ensureAdjacentContrast(colors: string[]): string[] {
  const result = [...colors];

  for (let pass = 0; pass < 5; pass++) {
    let allPass = true;

    for (let i = 0; i < result.length - 1; i++) {
      const { passes } = checkContrast(result[i], result[i + 1]);

      if (!passes) {
        allPass = false;
        // Alternate: make even-indexed colors darker, odd-indexed lighter
        if (i % 2 === 0) {
          result[i + 1] = adjustColorForContrast(result[i + 1], result[i], 'lighter');
        } else {
          result[i + 1] = adjustColorForContrast(result[i + 1], result[i], 'darker');
        }
      }
    }

    if (allPass) break;

    // If still failing, try the reverse direction
    if (!allPass && pass >= 2) {
      for (let i = result.length - 2; i >= 0; i--) {
        const { passes } = checkContrast(result[i], result[i + 1]);
        if (!passes) {
          const direction = i % 2 === 0 ? 'darker' : 'lighter';
          result[i] = adjustColorForContrast(result[i], result[i + 1], direction);
        }
      }
    }
  }

  return result;
}

/**
 * Generate a color palette from a text description.
 *
 * @param description - Text description (e.g., "warm sunset", "ocean blue professional")
 * @param count - Number of colors to generate (default 8, range 2-20)
 * @returns Array of hex color strings
 */
export function generatePalette(description: string, count: number = 8): string[] {
  // Clamp count to valid range
  const colorCount = Math.max(2, Math.min(20, count));

  // Step 1: Parse keywords from description
  const keywords = parseKeywords(description);

  // Step 2: Map keywords to hue ranges
  const hueRanges = mapKeywordsToHues(keywords);

  // Step 3: Extract mood modifiers for saturation/lightness
  const { saturation, lightness } = extractMoodModifiers(keywords);

  // Step 4: Distribute hues evenly across ranges
  const hues = distributeHues(hueRanges, colorCount);

  // Step 5: Generate initial colors with alternating lightness for contrast
  const colors: string[] = hues.map((hue, i) => {
    const t = colorCount > 1 ? i / (colorCount - 1) : 0.5;
    const s = saturation[0] + (saturation[1] - saturation[0]) * (0.5 + 0.5 * Math.sin(t * Math.PI));
    // Alternate between lower and upper lightness range for adjacent contrast
    const lRange = lightness[1] - lightness[0];
    const l = i % 2 === 0
      ? lightness[0] + lRange * 0.2
      : lightness[0] + lRange * 0.8;
    return hslToHex(hue, s, l);
  });

  // Step 6: Ensure WCAG AA contrast between adjacent colors
  const adjusted = ensureAdjacentContrast(colors);

  return adjusted;
}
