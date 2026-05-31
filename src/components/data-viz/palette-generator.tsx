'use client';

import { useState, useCallback } from 'react';
import { generatePalette } from '@/lib/ai/color-palette-generator';
import { checkContrast } from '@/lib/ai/color-palette-generator';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { Palette, Loader2, Save, Sparkles } from 'lucide-react';

// ============================================================
// Types
// ============================================================

export interface CustomPalette {
  id: string;
  name: string;
  colors: string[];
  createdAt: string;
}

export interface PaletteGeneratorProps {
  /** Callback when user saves a generated palette */
  onSavePalette?: (palette: CustomPalette) => void;
  /** Optional class name for the root element */
  className?: string;
}

// ============================================================
// Constants
// ============================================================

const MIN_COLORS = 2;
const MAX_COLORS = 20;
const DEFAULT_COLOR_COUNT = 8;

// ============================================================
// Sub-components
// ============================================================

function ColorSwatch({
  color,
  index,
  nextColor,
}: {
  color: string;
  index: number;
  nextColor?: string;
}) {
  const contrastInfo = nextColor ? checkContrast(color, nextColor) : null;

  return (
    <Tooltip>
      <TooltipTrigger
        className="group relative h-10 flex-1 min-w-[32px] cursor-pointer
          first:rounded-l-md last:rounded-r-md transition-transform
          hover:scale-110 hover:z-10 focus-visible:scale-110
          focus-visible:z-10 focus-visible:outline-2
          focus-visible:outline-offset-2 focus-visible:outline-ring"
        style={{ backgroundColor: color }}
        aria-label={`Color ${index + 1}: ${color}${
          contrastInfo
            ? `. Contrast ratio with next color: ${contrastInfo.ratio}:1`
            : ''
        }`}
      />
      <TooltipContent>
        <span className="font-mono text-xs">{color.toUpperCase()}</span>
        {contrastInfo && (
          <span className="ml-2 text-xs opacity-80">
            {contrastInfo.passes ? '✓' : '✗'} {contrastInfo.ratio}:1
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

function SwatchRow({ colors }: { colors: string[] }) {
  return (
    <TooltipProvider>
      <div
        className="flex w-full overflow-hidden rounded-md shadow-sm"
        role="list"
        aria-label="Generated color palette"
      >
        {colors.map((color, i) => (
          <ColorSwatch
            key={`${color}-${i}`}
            color={color}
            index={i}
            nextColor={i < colors.length - 1 ? colors[i + 1] : undefined}
          />
        ))}
      </div>
    </TooltipProvider>
  );
}

// ============================================================
// Main Component
// ============================================================

/**
 * Palette Generator UI
 *
 * Allows users to generate color palettes from text descriptions,
 * preview the generated swatches, and save them as custom palettes.
 *
 * Requirements: 16.1, 16.3
 */
export function PaletteGenerator({ onSavePalette, className }: PaletteGeneratorProps) {
  const [description, setDescription] = useState('');
  const [colorCount, setColorCount] = useState(DEFAULT_COLOR_COUNT);
  const [generatedColors, setGeneratedColors] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [paletteName, setPaletteName] = useState('');

  const handleGenerate = useCallback(async () => {
    if (!description.trim()) return;

    setIsGenerating(true);

    // Simulate async to allow UI to show loading state
    // (generatePalette is synchronous but could be expensive for large counts)
    await new Promise((resolve) => setTimeout(resolve, 150));

    const colors = generatePalette(description.trim(), colorCount);
    setGeneratedColors(colors);
    setPaletteName(description.trim());
    setIsGenerating(false);
  }, [description, colorCount]);

  const handleSave = useCallback(() => {
    if (generatedColors.length === 0 || !paletteName.trim()) return;

    const palette: CustomPalette = {
      id: crypto.randomUUID(),
      name: paletteName.trim(),
      colors: generatedColors,
      createdAt: new Date().toISOString(),
    };

    onSavePalette?.(palette);
  }, [generatedColors, paletteName, onSavePalette]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && description.trim()) {
        handleGenerate();
      }
    },
    [handleGenerate, description]
  );

  const handleColorCountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseInt(e.target.value, 10);
      if (!isNaN(value)) {
        setColorCount(Math.max(MIN_COLORS, Math.min(MAX_COLORS, value)));
      }
    },
    []
  );

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-4 w-4" aria-hidden="true" />
          Palette Generator
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Description input */}
        <div className="space-y-1.5">
          <Label htmlFor="palette-description">Description</Label>
          <Input
            id="palette-description"
            placeholder='e.g., "warm sunset", "ocean blue professional"'
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isGenerating}
            aria-describedby="palette-description-hint"
          />
          <p
            id="palette-description-hint"
            className="text-[11px] text-muted-foreground"
          >
            Describe the mood, theme, or colors you want
          </p>
        </div>

        {/* Color count input */}
        <div className="space-y-1.5">
          <Label htmlFor="palette-count">Number of colors</Label>
          <div className="flex items-center gap-3">
            <input
              id="palette-count"
              type="range"
              min={MIN_COLORS}
              max={MAX_COLORS}
              value={colorCount}
              onChange={handleColorCountChange}
              disabled={isGenerating}
              className="flex-1 h-2 rounded-lg appearance-none cursor-pointer
                bg-muted accent-primary"
              aria-valuemin={MIN_COLORS}
              aria-valuemax={MAX_COLORS}
              aria-valuenow={colorCount}
              aria-label={`Number of colors: ${colorCount}`}
            />
            <Input
              type="number"
              min={MIN_COLORS}
              max={MAX_COLORS}
              value={colorCount}
              onChange={handleColorCountChange}
              disabled={isGenerating}
              className="w-16 h-8 text-center text-sm"
              aria-label="Color count"
            />
          </div>
        </div>

        {/* Generate button */}
        <Button
          onClick={handleGenerate}
          disabled={!description.trim() || isGenerating}
          className="w-full cursor-pointer"
          aria-label="Generate color palette"
        >
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
              Generate Palette
            </>
          )}
        </Button>

        {/* Preview swatches */}
        {generatedColors.length > 0 && (
          <div className="space-y-3" aria-live="polite">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Preview ({generatedColors.length} colors)
              </span>
              <span className="text-[10px] text-muted-foreground">
                Hover for hex values
              </span>
            </div>

            <SwatchRow colors={generatedColors} />

            {/* Hex values list for accessibility */}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Show hex values
              </summary>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {generatedColors.map((color, i) => (
                  <span
                    key={`hex-${i}`}
                    className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5
                      font-mono text-[10px]"
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: color }}
                      aria-hidden="true"
                    />
                    {color.toUpperCase()}
                  </span>
                ))}
              </div>
            </details>
          </div>
        )}
      </CardContent>

      {/* Save as custom palette */}
      {generatedColors.length > 0 && (
        <CardFooter className="flex-col gap-2">
          <div className="flex w-full items-center gap-2">
            <Input
              value={paletteName}
              onChange={(e) => setPaletteName(e.target.value)}
              placeholder="Palette name"
              className="h-8 text-sm flex-1"
              aria-label="Custom palette name"
            />
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!paletteName.trim()}
              className="cursor-pointer shrink-0"
              aria-label="Save as custom palette"
            >
              <Save className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Save
            </Button>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
