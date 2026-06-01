import type { DataSource } from './types';

/**
 * Pre-built sample datasets for instant exploration.
 * Each dataset comes with realistic data and well-structured fields.
 */

interface SampleDataset {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'sales' | 'marketing' | 'finance' | 'operations';
  fields: { name: string; type: 'string' | 'number' | 'date' | 'boolean'; role: 'dimension' | 'measure' }[];
  generator: () => Record<string, unknown>[];
}

// ============================================================
// SALES DATASET — Quarterly sales by region and product
// ============================================================
function generateSalesData(): Record<string, unknown>[] {
  const regions = ['North', 'South', 'East', 'West', 'Central'];
  const products = ['Laptop', 'Phone', 'Tablet', 'Headphones', 'Monitor', 'Keyboard'];
  const channels = ['Online', 'Retail', 'Partner'];
  const data: Record<string, unknown>[] = [];

  const startDate = new Date('2024-01-01');
  for (let day = 0; day < 365; day++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + day);

    // 3-7 transactions per day
    const txCount = 3 + Math.floor(Math.random() * 5);
    for (let i = 0; i < txCount; i++) {
      const product = products[Math.floor(Math.random() * products.length)];
      const region = regions[Math.floor(Math.random() * regions.length)];
      const channel = channels[Math.floor(Math.random() * channels.length)];
      const basePrice =
        product === 'Laptop' ? 1200 :
        product === 'Phone' ? 800 :
        product === 'Tablet' ? 500 :
        product === 'Monitor' ? 400 :
        product === 'Headphones' ? 150 : 80;

      const quantity = 1 + Math.floor(Math.random() * 4);
      const discount = Math.random() < 0.3 ? Math.random() * 0.2 : 0;
      const revenue = Math.round(basePrice * quantity * (1 - discount) * 100) / 100;
      const cost = Math.round(basePrice * quantity * 0.6 * 100) / 100;

      data.push({
        date: date.toISOString().split('T')[0],
        region,
        product,
        channel,
        quantity,
        revenue,
        cost,
        profit: Math.round((revenue - cost) * 100) / 100,
        discount_rate: Math.round(discount * 10000) / 100,
      });
    }
  }
  return data;
}

// ============================================================
// MARKETING DATASET — Campaign performance
// ============================================================
function generateMarketingData(): Record<string, unknown>[] {
  const campaigns = ['Summer Sale', 'Brand Awareness', 'Product Launch', 'Holiday Promo', 'Retargeting'];
  const channels = ['Google Ads', 'Facebook', 'Instagram', 'Email', 'LinkedIn', 'Twitter'];
  const audiences = ['New Visitors', 'Returning', 'High Intent', 'Lookalike'];
  const data: Record<string, unknown>[] = [];

  const startDate = new Date('2024-06-01');
  for (let week = 0; week < 26; week++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + week * 7);

    for (const campaign of campaigns) {
      for (const channel of channels) {
        const audience = audiences[Math.floor(Math.random() * audiences.length)];
        const impressions = Math.floor(10000 + Math.random() * 90000);
        const ctr = 0.005 + Math.random() * 0.04;
        const clicks = Math.floor(impressions * ctr);
        const conversions = Math.floor(clicks * (0.01 + Math.random() * 0.08));
        const spend = Math.round((clicks * (0.5 + Math.random() * 4.5)) * 100) / 100;
        const revenue = Math.round(conversions * (50 + Math.random() * 250) * 100) / 100;

        data.push({
          week: date.toISOString().split('T')[0],
          campaign,
          channel,
          audience,
          impressions,
          clicks,
          conversions,
          spend,
          revenue,
          ctr: Math.round(ctr * 10000) / 100,
          roas: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : 0,
        });
      }
    }
  }
  return data;
}

// ============================================================
// FINANCE DATASET — Monthly P&L by department
// ============================================================
function generateFinanceData(): Record<string, unknown>[] {
  const departments = ['Engineering', 'Sales', 'Marketing', 'Operations', 'Finance', 'HR', 'Customer Success'];
  const categories = ['Revenue', 'Salaries', 'Marketing Spend', 'Software', 'Travel', 'Office'];
  const data: Record<string, unknown>[] = [];

  for (let month = 0; month < 24; month++) {
    const date = new Date(2023, month, 1);
    for (const dept of departments) {
      for (const category of categories) {
        const isRevenue = category === 'Revenue';
        const baseAmount =
          category === 'Revenue' ? 200000 + Math.random() * 800000 :
          category === 'Salaries' ? 50000 + Math.random() * 150000 :
          category === 'Marketing Spend' ? 10000 + Math.random() * 40000 :
          category === 'Software' ? 2000 + Math.random() * 8000 :
          category === 'Travel' ? 1000 + Math.random() * 5000 :
          500 + Math.random() * 3000;

        // Departments only have certain categories
        if (category === 'Marketing Spend' && dept !== 'Marketing') continue;
        if (category === 'Revenue' && !['Sales', 'Customer Success'].includes(dept)) continue;

        data.push({
          month: date.toISOString().split('T')[0],
          quarter: `Q${Math.floor(month % 12 / 3) + 1} ${date.getFullYear()}`,
          year: date.getFullYear(),
          department: dept,
          category,
          type: isRevenue ? 'Income' : 'Expense',
          amount: Math.round(baseAmount * 100) / 100,
          budget: Math.round(baseAmount * (0.9 + Math.random() * 0.2) * 100) / 100,
        });
      }
    }
  }
  return data;
}

// ============================================================
// OPERATIONS DATASET — Server metrics
// ============================================================
function generateOperationsData(): Record<string, unknown>[] {
  const servers = ['web-01', 'web-02', 'web-03', 'api-01', 'api-02', 'db-01', 'db-02', 'cache-01'];
  const regions = ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'];
  const data: Record<string, unknown>[] = [];

  const startDate = new Date('2025-04-01T00:00:00');
  for (let hour = 0; hour < 30 * 24; hour++) {
    const timestamp = new Date(startDate);
    timestamp.setHours(startDate.getHours() + hour);

    for (const server of servers) {
      const region = regions[server.charCodeAt(0) % regions.length];
      const isDb = server.startsWith('db');
      const isCache = server.startsWith('cache');

      const cpu = Math.min(99, 20 + Math.random() * 30 + (isDb ? 20 : 0) + Math.sin(hour / 6) * 15);
      const memory = Math.min(99, 40 + Math.random() * 20 + (isCache ? 30 : 0));
      const requests = Math.floor(100 + Math.random() * 5000 * (1 + Math.sin(hour / 12)));
      const errors = Math.floor(requests * (0.001 + Math.random() * 0.02));
      const responseTime = Math.round((50 + Math.random() * 200) * 100) / 100;

      data.push({
        timestamp: timestamp.toISOString(),
        server,
        region,
        service_type: isDb ? 'Database' : isCache ? 'Cache' : server.startsWith('api') ? 'API' : 'Web',
        cpu_usage: Math.round(cpu * 100) / 100,
        memory_usage: Math.round(memory * 100) / 100,
        request_count: requests,
        error_count: errors,
        response_time_ms: responseTime,
        status: errors > requests * 0.05 ? 'degraded' : cpu > 90 ? 'warning' : 'healthy',
      });
    }
  }
  return data;
}

// ============================================================
// REGISTRY
// ============================================================
export const SAMPLE_DATASETS: SampleDataset[] = [
  {
    id: 'sample-sales',
    name: 'Sales Dashboard',
    description: 'Yearly sales by region, product, and channel',
    icon: '💰',
    category: 'sales',
    fields: [
      { name: 'date', type: 'date', role: 'dimension' },
      { name: 'region', type: 'string', role: 'dimension' },
      { name: 'product', type: 'string', role: 'dimension' },
      { name: 'channel', type: 'string', role: 'dimension' },
      { name: 'quantity', type: 'number', role: 'measure' },
      { name: 'revenue', type: 'number', role: 'measure' },
      { name: 'cost', type: 'number', role: 'measure' },
      { name: 'profit', type: 'number', role: 'measure' },
      { name: 'discount_rate', type: 'number', role: 'measure' },
    ],
    generator: generateSalesData,
  },
  {
    id: 'sample-marketing',
    name: 'Marketing Performance',
    description: 'Campaign ROI across channels and audiences',
    icon: '📣',
    category: 'marketing',
    fields: [
      { name: 'week', type: 'date', role: 'dimension' },
      { name: 'campaign', type: 'string', role: 'dimension' },
      { name: 'channel', type: 'string', role: 'dimension' },
      { name: 'audience', type: 'string', role: 'dimension' },
      { name: 'impressions', type: 'number', role: 'measure' },
      { name: 'clicks', type: 'number', role: 'measure' },
      { name: 'conversions', type: 'number', role: 'measure' },
      { name: 'spend', type: 'number', role: 'measure' },
      { name: 'revenue', type: 'number', role: 'measure' },
      { name: 'ctr', type: 'number', role: 'measure' },
      { name: 'roas', type: 'number', role: 'measure' },
    ],
    generator: generateMarketingData,
  },
  {
    id: 'sample-finance',
    name: 'Financial P&L',
    description: '2-year revenue and expense breakdown',
    icon: '📊',
    category: 'finance',
    fields: [
      { name: 'month', type: 'date', role: 'dimension' },
      { name: 'quarter', type: 'string', role: 'dimension' },
      { name: 'year', type: 'number', role: 'dimension' },
      { name: 'department', type: 'string', role: 'dimension' },
      { name: 'category', type: 'string', role: 'dimension' },
      { name: 'type', type: 'string', role: 'dimension' },
      { name: 'amount', type: 'number', role: 'measure' },
      { name: 'budget', type: 'number', role: 'measure' },
    ],
    generator: generateFinanceData,
  },
  {
    id: 'sample-operations',
    name: 'Server Operations',
    description: 'Real-time infrastructure metrics',
    icon: '🖥️',
    category: 'operations',
    fields: [
      { name: 'timestamp', type: 'date', role: 'dimension' },
      { name: 'server', type: 'string', role: 'dimension' },
      { name: 'region', type: 'string', role: 'dimension' },
      { name: 'service_type', type: 'string', role: 'dimension' },
      { name: 'status', type: 'string', role: 'dimension' },
      { name: 'cpu_usage', type: 'number', role: 'measure' },
      { name: 'memory_usage', type: 'number', role: 'measure' },
      { name: 'request_count', type: 'number', role: 'measure' },
      { name: 'error_count', type: 'number', role: 'measure' },
      { name: 'response_time_ms', type: 'number', role: 'measure' },
    ],
    generator: generateOperationsData,
  },
];

/**
 * Build a DataSource from a sample dataset id.
 */
export function buildSampleDataSource(datasetId: string): DataSource | null {
  const dataset = SAMPLE_DATASETS.find((d) => d.id === datasetId);
  if (!dataset) return null;

  const rows = dataset.generator();
  const sampleRow = rows[0] || {};

  return {
    id: `ds_${dataset.id}_${Date.now()}`,
    name: dataset.name,
    fileName: `${dataset.id}.json`,
    rows,
    rowCount: rows.length,
    importedAt: new Date().toISOString(),
    fields: dataset.fields.map((f, idx) => ({
      id: `f_${dataset.id}_${idx}`,
      name: f.name,
      originalName: f.name,
      type: f.type,
      role: f.role,
      sampleValues: rows.slice(0, 5).map((r) => String(r[f.name] ?? '')),
      nullCount: 0,
      uniqueCount: new Set(rows.map((r) => r[f.name])).size,
    })),
  };
}

export type { SampleDataset };
