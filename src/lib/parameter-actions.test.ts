import { describe, it, expect, vi } from 'vitest';
import {
  handleChartInteraction,
  getParameterFilters,
  ParameterStore,
} from './parameter-actions';
import type { Parameter, ParameterAction } from './types';

describe('handleChartInteraction', () => {
  function createStore(
    parameters: Parameter[],
    parameterActions: ParameterAction[]
  ): ParameterStore {
    return {
      parameters,
      parameterActions,
      updateParameterValue: vi.fn(),
    };
  }

  it('updates parameter value when matching action exists for click', () => {
    const params: Parameter[] = [
      {
        id: 'param-1',
        name: 'Selected Region',
        dataType: 'string',
        currentValue: '',
        defaultValue: '',
      },
    ];

    const actions: ParameterAction[] = [
      {
        id: 'action-1',
        parameterId: 'param-1',
        sourceChartId: 'chart-A',
        targetField: 'region',
        actionType: 'click',
      },
    ];

    const store = createStore(params, actions);
    handleChartInteraction('chart-A', 'click', 'North America', store);

    expect(store.updateParameterValue).toHaveBeenCalledWith(
      'param-1',
      'North America'
    );
  });

  it('does not update when actionType does not match', () => {
    const actions: ParameterAction[] = [
      {
        id: 'action-1',
        parameterId: 'param-1',
        sourceChartId: 'chart-A',
        targetField: 'region',
        actionType: 'hover',
      },
    ];

    const store = createStore([], actions);
    handleChartInteraction('chart-A', 'click', 'Europe', store);

    expect(store.updateParameterValue).not.toHaveBeenCalled();
  });

  it('does not update when chartId does not match', () => {
    const actions: ParameterAction[] = [
      {
        id: 'action-1',
        parameterId: 'param-1',
        sourceChartId: 'chart-A',
        targetField: 'region',
        actionType: 'click',
      },
    ];

    const store = createStore([], actions);
    handleChartInteraction('chart-B', 'click', 'Asia', store);

    expect(store.updateParameterValue).not.toHaveBeenCalled();
  });

  it('updates multiple parameters when multiple actions match', () => {
    const actions: ParameterAction[] = [
      {
        id: 'action-1',
        parameterId: 'param-1',
        sourceChartId: 'chart-A',
        targetField: 'region',
        actionType: 'click',
      },
      {
        id: 'action-2',
        parameterId: 'param-2',
        sourceChartId: 'chart-A',
        targetField: 'category',
        actionType: 'click',
      },
    ];

    const store = createStore([], actions);
    handleChartInteraction('chart-A', 'click', 'Electronics', store);

    expect(store.updateParameterValue).toHaveBeenCalledTimes(2);
    expect(store.updateParameterValue).toHaveBeenCalledWith(
      'param-1',
      'Electronics'
    );
    expect(store.updateParameterValue).toHaveBeenCalledWith(
      'param-2',
      'Electronics'
    );
  });

  it('handles hover action type', () => {
    const actions: ParameterAction[] = [
      {
        id: 'action-1',
        parameterId: 'param-1',
        sourceChartId: 'chart-A',
        targetField: 'product',
        actionType: 'hover',
      },
    ];

    const store = createStore([], actions);
    handleChartInteraction('chart-A', 'hover', 'Widget', store);

    expect(store.updateParameterValue).toHaveBeenCalledWith('param-1', 'Widget');
  });

  it('handles numeric dimension values', () => {
    const actions: ParameterAction[] = [
      {
        id: 'action-1',
        parameterId: 'param-1',
        sourceChartId: 'chart-A',
        targetField: 'year',
        actionType: 'click',
      },
    ];

    const store = createStore([], actions);
    handleChartInteraction('chart-A', 'click', 2024, store);

    expect(store.updateParameterValue).toHaveBeenCalledWith('param-1', 2024);
  });

  it('does nothing when no actions exist', () => {
    const store = createStore([], []);
    handleChartInteraction('chart-A', 'click', 'value', store);

    expect(store.updateParameterValue).not.toHaveBeenCalled();
  });

  it('only updates actions matching both chartId and actionType', () => {
    const actions: ParameterAction[] = [
      {
        id: 'action-1',
        parameterId: 'param-1',
        sourceChartId: 'chart-A',
        targetField: 'region',
        actionType: 'click',
      },
      {
        id: 'action-2',
        parameterId: 'param-2',
        sourceChartId: 'chart-A',
        targetField: 'region',
        actionType: 'hover',
      },
      {
        id: 'action-3',
        parameterId: 'param-3',
        sourceChartId: 'chart-B',
        targetField: 'region',
        actionType: 'click',
      },
    ];

    const store = createStore([], actions);
    handleChartInteraction('chart-A', 'click', 'USA', store);

    expect(store.updateParameterValue).toHaveBeenCalledTimes(1);
    expect(store.updateParameterValue).toHaveBeenCalledWith('param-1', 'USA');
  });
});

describe('getParameterFilters', () => {
  it('returns filters for charts that are not the source', () => {
    const params: Parameter[] = [
      {
        id: 'param-1',
        name: 'Selected Region',
        dataType: 'string',
        currentValue: 'North America',
        defaultValue: '',
      },
    ];

    const actions: ParameterAction[] = [
      {
        id: 'action-1',
        parameterId: 'param-1',
        sourceChartId: 'chart-A',
        targetField: 'region',
        actionType: 'click',
      },
    ];

    // chart-B is a consumer (not the source), so it gets the filter
    const filters = getParameterFilters(params, actions, 'chart-B');

    expect(filters).toHaveLength(1);
    expect(filters[0]).toEqual({
      parameterId: 'param-1',
      parameterName: 'Selected Region',
      field: 'region',
      value: 'North America',
    });
  });

  it('does not return filters for the source chart itself', () => {
    const params: Parameter[] = [
      {
        id: 'param-1',
        name: 'Selected Region',
        dataType: 'string',
        currentValue: 'Europe',
        defaultValue: '',
      },
    ];

    const actions: ParameterAction[] = [
      {
        id: 'action-1',
        parameterId: 'param-1',
        sourceChartId: 'chart-A',
        targetField: 'region',
        actionType: 'click',
      },
    ];

    const filters = getParameterFilters(params, actions, 'chart-A');

    expect(filters).toHaveLength(0);
  });

  it('does not return filters when parameter has default value', () => {
    const params: Parameter[] = [
      {
        id: 'param-1',
        name: 'Selected Region',
        dataType: 'string',
        currentValue: 'all',
        defaultValue: 'all',
      },
    ];

    const actions: ParameterAction[] = [
      {
        id: 'action-1',
        parameterId: 'param-1',
        sourceChartId: 'chart-A',
        targetField: 'region',
        actionType: 'click',
      },
    ];

    const filters = getParameterFilters(params, actions, 'chart-B');

    expect(filters).toHaveLength(0);
  });

  it('returns multiple filters from different parameters', () => {
    const params: Parameter[] = [
      {
        id: 'param-1',
        name: 'Region',
        dataType: 'string',
        currentValue: 'Asia',
        defaultValue: '',
      },
      {
        id: 'param-2',
        name: 'Year',
        dataType: 'number',
        currentValue: 2024,
        defaultValue: 0,
      },
    ];

    const actions: ParameterAction[] = [
      {
        id: 'action-1',
        parameterId: 'param-1',
        sourceChartId: 'chart-A',
        targetField: 'region',
        actionType: 'click',
      },
      {
        id: 'action-2',
        parameterId: 'param-2',
        sourceChartId: 'chart-A',
        targetField: 'year',
        actionType: 'click',
      },
    ];

    const filters = getParameterFilters(params, actions, 'chart-B');

    expect(filters).toHaveLength(2);
    expect(filters[0].field).toBe('region');
    expect(filters[0].value).toBe('Asia');
    expect(filters[1].field).toBe('year');
    expect(filters[1].value).toBe(2024);
  });

  it('returns empty array when no actions exist', () => {
    const filters = getParameterFilters([], [], 'chart-A');
    expect(filters).toEqual([]);
  });

  it('skips actions with missing parameter references', () => {
    const params: Parameter[] = [];

    const actions: ParameterAction[] = [
      {
        id: 'action-1',
        parameterId: 'param-nonexistent',
        sourceChartId: 'chart-A',
        targetField: 'region',
        actionType: 'click',
      },
    ];

    const filters = getParameterFilters(params, actions, 'chart-B');

    expect(filters).toHaveLength(0);
  });

  it('handles numeric default and current values correctly', () => {
    const params: Parameter[] = [
      {
        id: 'param-1',
        name: 'Threshold',
        dataType: 'number',
        currentValue: 100,
        defaultValue: 0,
      },
    ];

    const actions: ParameterAction[] = [
      {
        id: 'action-1',
        parameterId: 'param-1',
        sourceChartId: 'chart-A',
        targetField: 'threshold',
        actionType: 'click',
      },
    ];

    const filters = getParameterFilters(params, actions, 'chart-B');

    expect(filters).toHaveLength(1);
    expect(filters[0].value).toBe(100);
  });

  it('returns filters from multiple source charts', () => {
    const params: Parameter[] = [
      {
        id: 'param-1',
        name: 'Region',
        dataType: 'string',
        currentValue: 'Europe',
        defaultValue: '',
      },
      {
        id: 'param-2',
        name: 'Category',
        dataType: 'string',
        currentValue: 'Tech',
        defaultValue: '',
      },
    ];

    const actions: ParameterAction[] = [
      {
        id: 'action-1',
        parameterId: 'param-1',
        sourceChartId: 'chart-A',
        targetField: 'region',
        actionType: 'click',
      },
      {
        id: 'action-2',
        parameterId: 'param-2',
        sourceChartId: 'chart-B',
        targetField: 'category',
        actionType: 'click',
      },
    ];

    // chart-C receives filters from both chart-A and chart-B
    const filters = getParameterFilters(params, actions, 'chart-C');

    expect(filters).toHaveLength(2);
    expect(filters[0].field).toBe('region');
    expect(filters[1].field).toBe('category');
  });
});
