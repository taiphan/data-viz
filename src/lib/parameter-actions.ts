import type { Parameter, ParameterAction } from './types';

/**
 * Represents a filter derived from a parameter's current value,
 * applicable to charts that reference the parameter via actions.
 */
export interface ParameterFilter {
  parameterId: string;
  parameterName: string;
  field: string;
  value: string | number;
}

/**
 * Minimal store interface for parameter operations.
 * Decoupled from Zustand for testability.
 */
export interface ParameterStore {
  parameters: Parameter[];
  parameterActions: ParameterAction[];
  updateParameterValue: (id: string, value: string | number) => void;
}

/**
 * Handles a chart interaction (click or hover) by finding matching
 * ParameterActions for the source chart and updating parameter values.
 *
 * When a parameter value is updated via Zustand, other charts that
 * use parameter-based filters will auto-update reactively.
 */
export function handleChartInteraction(
  chartId: string,
  actionType: 'click' | 'hover',
  dimensionValue: string | number,
  store: ParameterStore
): void {
  const matchingActions = store.parameterActions.filter(
    (action) =>
      action.sourceChartId === chartId && action.actionType === actionType
  );

  for (const action of matchingActions) {
    store.updateParameterValue(action.parameterId, dimensionValue);
  }
}

/**
 * Returns active parameter filters for a given chart.
 *
 * A chart receives filters from parameters when there exists a
 * ParameterAction where the chart is NOT the source (i.e., it's a
 * target/consumer). The filter uses the action's targetField and
 * the parameter's currentValue.
 *
 * Only returns filters for parameters whose currentValue differs
 * from their defaultValue (indicating an active selection).
 */
export function getParameterFilters(
  parameters: Parameter[],
  parameterActions: ParameterAction[],
  chartId: string
): ParameterFilter[] {
  const filters: ParameterFilter[] = [];

  for (const action of parameterActions) {
    // Skip actions where this chart is the source (it triggers, not receives)
    if (action.sourceChartId === chartId) {
      continue;
    }

    const parameter = parameters.find((p) => p.id === action.parameterId);
    if (!parameter) {
      continue;
    }

    // Only apply filter when parameter has an active (non-default) value
    if (parameter.currentValue === parameter.defaultValue) {
      continue;
    }

    filters.push({
      parameterId: parameter.id,
      parameterName: parameter.name,
      field: action.targetField,
      value: parameter.currentValue,
    });
  }

  return filters;
}
