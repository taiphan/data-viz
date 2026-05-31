import { describe, it, expect } from 'vitest';
import {
  getAllConnectors,
  getConnectorById,
  getConnectorsByCategory,
  searchConnectors,
} from './registry';
import { ConnectorCategory } from './types';

describe('Connector Registry', () => {
  describe('getAllConnectors', () => {
    it('returns 60+ connector definitions', () => {
      const connectors = getAllConnectors();
      expect(connectors.length).toBeGreaterThanOrEqual(60);
    });

    it('every connector has required fields', () => {
      const connectors = getAllConnectors();
      for (const c of connectors) {
        expect(c.id).toBeTruthy();
        expect(c.name).toBeTruthy();
        expect(c.category).toBeTruthy();
        expect(c.icon).toBeTruthy();
        expect(c.description).toBeTruthy();
        expect(c.authMethods.length).toBeGreaterThan(0);
        expect(typeof c.supportsSchemaDiscovery).toBe('boolean');
        expect(typeof c.supportsCustomQuery).toBe('boolean');
        expect(typeof c.proxyRequired).toBe('boolean');
      }
    });

    it('every connector has a unique id', () => {
      const connectors = getAllConnectors();
      const ids = connectors.map((c) => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('getConnectorById', () => {
    it('returns the correct connector for a valid id', () => {
      const connector = getConnectorById('postgresql');
      expect(connector).toBeDefined();
      expect(connector!.name).toBe('PostgreSQL');
      expect(connector!.category).toBe('database');
    });

    it('returns undefined for an unknown id', () => {
      const connector = getConnectorById('nonexistent');
      expect(connector).toBeUndefined();
    });
  });

  describe('getConnectorsByCategory', () => {
    it('groups connectors by category with correct keys', () => {
      const grouped = getConnectorsByCategory();
      const expectedCategories: ConnectorCategory[] = [
        'cloud-warehouse',
        'database',
        'cloud-service',
        'file',
        'cloud-storage',
        'rest-api',
        'connectivity',
      ];

      for (const category of expectedCategories) {
        expect(grouped[category]).toBeDefined();
        expect(Array.isArray(grouped[category])).toBe(true);
      }
    });

    it('every connector in a group matches the group category', () => {
      const grouped = getConnectorsByCategory();
      for (const [category, connectors] of Object.entries(grouped)) {
        for (const connector of connectors) {
          expect(connector.category).toBe(category);
        }
      }
    });

    it('total count across groups equals total connectors', () => {
      const grouped = getConnectorsByCategory();
      const totalGrouped = Object.values(grouped).reduce(
        (sum, group) => sum + group.length,
        0,
      );
      expect(totalGrouped).toBe(getAllConnectors().length);
    });
  });

  describe('searchConnectors', () => {
    it('returns all connectors for empty query', () => {
      const results = searchConnectors('');
      expect(results.length).toBe(getAllConnectors().length);
    });

    it('filters by name (case-insensitive)', () => {
      const results = searchConnectors('snow');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((c) => c.name === 'Snowflake')).toBe(true);
    });

    it('filters by category', () => {
      const results = searchConnectors('database');
      expect(results.length).toBeGreaterThan(0);
      for (const c of results) {
        const nameMatch = c.name.toLowerCase().includes('database');
        const categoryMatch = c.category.toLowerCase().includes('database');
        expect(nameMatch || categoryMatch).toBe(true);
      }
    });

    it('returns empty array for non-matching query', () => {
      const results = searchConnectors('zzzznonexistent');
      expect(results.length).toBe(0);
    });
  });

  describe('Requirement 1.4 connectors', () => {
    const requiredConnectors = [
      'amazon-athena',
      'amazon-aurora',
      'amazon-emr-hadoop-hive',
      'amazon-redshift',
      'amazon-s3',
      'alibaba-analyticsdb',
      'alibaba-data-lake-analytics',
      'alibaba-maxcompute',
      'databricks',
      'google-cloud-sql',
      'google-looker',
      'azure-data-lake-gen2',
      'azure-synapse',
      'snowflake',
      'qubole-presto',
      'postgresql',
      'mysql',
      'mssql',
      'oracle',
      'mariadb',
      'ibm-db2',
      'ibm-netezza',
      'mongodb',
      'clickhouse',
      'sap-hana',
      'sap-sybase-iq',
      'sap-sybase-ase',
      'teradata',
      'hp-vertica',
      'exasol',
      'pivotal-greenplum',
      'monetdb',
      'singlestore',
      'microsoft-access',
      'kognitio',
      'kyvos',
      'marklogic',
      'presto',
      'sparksql',
      'salesforce',
      'salesforce-data-cloud',
      'salesforce-datorama',
      'salesforce-marketing-cloud',
      'oracle-netsuite',
      'splunk',
      'box',
      'dropbox',
      'google-drive',
      'onedrive',
      'microsoft-excel',
      'pdf',
      'text-file',
      'statistical-file',
      'rest-api',
      'jdbc',
      'odbc',
      'apache-drill',
      'cloudera-hadoop',
      'cloudera-impala',
      'hortonworks-hadoop-hive',
      'mapr-hadoop-hive',
      'ibm-biginsights',
      'denodo',
    ];

    it.each(requiredConnectors)('includes %s connector', (id) => {
      const connector = getConnectorById(id);
      expect(connector).toBeDefined();
    });
  });
});
