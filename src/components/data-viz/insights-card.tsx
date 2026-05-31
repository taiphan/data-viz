'use client';

import { useState, useCallback } from 'react';
import { generateInsights, type Insight, type InsightType } from '@/lib/ai/insights-engine';
import {
  Card,
  CardHeader,
  CardTitle,
  CardAction,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Lightbulb } from 'lucide-react';

// ============================================================
// Types
// ============================================================

export interface InsightsCardProps {
  values: number[];
  labels?: string[];
  title?: string;
  className?: string;
}

// ============================================================
// Insight Type Configuration
// ============================================================

const INSIGHT_TYPE_CONFIG: Record<InsightType, { icon: string; label: string }> = {
  top: { icon: '↑', label: 'Top' },
  bottom: { icon: '↓', label: 'Bottom' },
  outlier: { icon: '⚠', label: 'Outlier' },
  trend: { icon: '📈', label: 'Trend' },
  change: { icon: 'Δ', label: 'Change' },
};

// ============================================================
// Sub-components
// ============================================================

function InsightItem({ insight }: { insight: Insight }) {
  const config = INSIGHT_TYPE_CONFIG[insight.type];

  return (
    <li className="flex items-start gap-2 py-1.5">
      <Badge
        variant="outline"
        className="mt-0.5 shrink-0 text-[10px]"
        aria-label={config.label}
      >
        <span aria-hidden="true">{config.icon}</span>
      </Badge>
      <span className="text-xs text-foreground leading-relaxed">
        {insight.description}
      </span>
    </li>
  );
}

// ============================================================
// Main Component
// ============================================================

/**
 * Insights Card — displays AI-generated statistical insights as a text card.
 * Accepts numeric data and optional labels, generates insights internally.
 * Supports regeneration on data change via a "Regenerate" button.
 *
 * Requirements: 15.3, 15.5
 */
export function InsightsCard({
  values,
  labels,
  title = 'Insights',
  className,
}: InsightsCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [insights, setInsights] = useState<Insight[]>(() =>
    generateInsights({ values, labels })
  );

  const regenerate = useCallback(() => {
    setIsLoading(true);

    // Simulate async to show loading state (insights are computed synchronously
    // but in a real scenario data fetching may be async)
    requestAnimationFrame(() => {
      const newInsights = generateInsights({ values, labels });
      setInsights(newInsights);
      setIsLoading(false);
    });
  }, [values, labels]);

  const hasInsights = insights.length > 0;

  return (
    <Card size="sm" className={className} aria-label={title}>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Lightbulb className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {title}
        </CardTitle>
        <CardAction>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={regenerate}
            disabled={isLoading}
            aria-label="Regenerate insights"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent>
        {isLoading && (
          <div
            className="flex items-center justify-center py-4"
            role="status"
            aria-label="Generating insights"
          >
            <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="ml-2 text-xs text-muted-foreground">
              Generating insights…
            </span>
          </div>
        )}

        {!isLoading && !hasInsights && (
          <p className="text-xs text-muted-foreground text-center py-4">
            No insights available. Try adding more data points.
          </p>
        )}

        {!isLoading && hasInsights && (
          <ul className="space-y-0.5" aria-label="Generated insights">
            {insights.map((insight, index) => (
              <InsightItem key={`${insight.type}-${index}`} insight={insight} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
