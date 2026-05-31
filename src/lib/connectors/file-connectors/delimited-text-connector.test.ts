import { describe, it, expect } from 'vitest';
import { parseDelimitedString } from './delimited-text-connector';

describe('delimited-text-connector', () => {
  describe('parseDelimitedString', () => {
    it('parses a basic CSV with headers', () => {
      const csv = 'name,age,city\nAlice,30,NYC\nBob,25,LA\n';

      const result = parseDelimitedString(csv, 'test.csv');

      expect(result.name).toBe('test');
      expect(result.fileName).toBe('test.csv');
      expect(result.rowCount).toBe(2);
      expect(result.fields).toHaveLength(3);
      expect(result.fields[0].name).toBe('name');
      expect(result.fields[1].name).toBe('age');
      expect(result.fields[2].name).toBe('city');
      expect(result.rows[0]).toEqual({ name: 'Alice', age: '30', city: 'NYC' });
      expect(result.rows[1]).toEqual({ name: 'Bob', age: '25', city: 'LA' });
    });

    it('detects numeric column types', () => {
      const csv = 'id,value,label\n1,100.5,foo\n2,200.3,bar\n3,300.1,baz\n';

      const result = parseDelimitedString(csv, 'numbers.csv');

      const idField = result.fields.find((f) => f.name === 'id');
      const valueField = result.fields.find((f) => f.name === 'value');
      const labelField = result.fields.find((f) => f.name === 'label');

      expect(idField?.type).toBe('number');
      expect(idField?.role).toBe('measure');
      expect(valueField?.type).toBe('number');
      expect(valueField?.role).toBe('measure');
      expect(labelField?.type).toBe('string');
      expect(labelField?.role).toBe('dimension');
    });

    it('detects boolean column types', () => {
      const csv = 'name,active\nAlice,true\nBob,false\nCharlie,true\n';

      const result = parseDelimitedString(csv, 'booleans.csv');

      const activeField = result.fields.find((f) => f.name === 'active');
      expect(activeField?.type).toBe('boolean');
      expect(activeField?.role).toBe('dimension');
    });

    it('detects date column types', () => {
      const csv = 'event,date\nLaunch,2024-01-15\nRelease,2024-06-20\nUpdate,2024-12-01\n';

      const result = parseDelimitedString(csv, 'dates.csv');

      const dateField = result.fields.find((f) => f.name === 'date');
      expect(dateField?.type).toBe('date');
      expect(dateField?.role).toBe('dimension');
    });

    it('parses TSV files with tab delimiter', () => {
      const tsv = 'name\tage\tcity\nAlice\t30\tNYC\nBob\t25\tLA\n';

      const result = parseDelimitedString(tsv, 'test.tsv', { delimiter: '\t' });

      expect(result.rowCount).toBe(2);
      expect(result.fields[0].name).toBe('name');
      expect(result.rows[0]).toEqual({ name: 'Alice', age: '30', city: 'NYC' });
    });

    it('supports custom delimiter', () => {
      const data = 'name|age|city\nAlice|30|NYC\nBob|25|LA\n';

      const result = parseDelimitedString(data, 'test.txt', { delimiter: '|' });

      expect(result.rowCount).toBe(2);
      expect(result.fields).toHaveLength(3);
      expect(result.rows[0]).toEqual({ name: 'Alice', age: '30', city: 'NYC' });
    });

    it('supports custom quote character', () => {
      const csv = "name,description\n'Alice','She said, hello'\n'Bob','He said, bye'\n";

      const result = parseDelimitedString(csv, 'quoted.csv', { quoteChar: "'" });

      expect(result.rowCount).toBe(2);
      expect(result.rows[0]).toEqual({
        name: 'Alice',
        description: 'She said, hello',
      });
    });

    it('handles header=false by generating column names', () => {
      const csv = 'Alice,30,NYC\nBob,25,LA\n';

      const result = parseDelimitedString(csv, 'no-header.csv', { header: false });

      expect(result.rowCount).toBe(2);
      expect(result.fields[0].name).toBe('Column 1');
      expect(result.fields[1].name).toBe('Column 2');
      expect(result.fields[2].name).toBe('Column 3');
    });

    it('handles empty content gracefully', () => {
      const result = parseDelimitedString('', 'empty.csv');

      expect(result.rowCount).toBe(0);
      expect(result.fields).toHaveLength(0);
      expect(result.rows).toHaveLength(0);
    });

    it('handles content with only headers', () => {
      const csv = 'name,age,city\n';

      const result = parseDelimitedString(csv, 'headers-only.csv');

      expect(result.rowCount).toBe(0);
      expect(result.fields).toHaveLength(0);
    });

    it('skips empty lines', () => {
      const csv = 'name,age\nAlice,30\n\n\nBob,25\n\n';

      const result = parseDelimitedString(csv, 'gaps.csv');

      expect(result.rowCount).toBe(2);
    });

    it('computes field statistics correctly', () => {
      const csv = 'name,value\nAlice,10\nBob,\nCharlie,30\nAlice,40\n';

      const result = parseDelimitedString(csv, 'stats.csv');

      const nameField = result.fields.find((f) => f.name === 'name');
      const valueField = result.fields.find((f) => f.name === 'value');

      expect(nameField?.nullCount).toBe(0);
      expect(nameField?.uniqueCount).toBe(3);
      expect(valueField?.nullCount).toBe(1);
    });

    it('generates valid DataSource structure', () => {
      const csv = 'x,y\n1,2\n3,4\n';

      const result = parseDelimitedString(csv, 'data.csv');

      expect(result.id).toBeDefined();
      expect(result.importedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(result.fields.every((f) => f.id)).toBe(true);
      expect(result.fields.every((f) => f.originalName)).toBe(true);
    });

    it('auto-detects delimiter when not specified', () => {
      const tsv = 'name\tage\nAlice\t30\nBob\t25\n';

      // PapaParse auto-detects tab delimiter
      const result = parseDelimitedString(tsv, 'auto.tsv');

      expect(result.fields[0].name).toBe('name');
      expect(result.fields[1].name).toBe('age');
      expect(result.rowCount).toBe(2);
    });

    it('handles quoted fields with commas inside', () => {
      const csv = 'name,address\n"Smith, John","123 Main St, Apt 4"\nJane,"456 Oak Ave"\n';

      const result = parseDelimitedString(csv, 'quoted-commas.csv');

      expect(result.rowCount).toBe(2);
      expect(result.rows[0]).toEqual({
        name: 'Smith, John',
        address: '123 Main St, Apt 4',
      });
    });

    it('preserves original column names', () => {
      const csv = 'First Name,Last Name,Total Sales\nAlice,Smith,1000\n';

      const result = parseDelimitedString(csv, 'names.csv');

      expect(result.fields[0].name).toBe('First Name');
      expect(result.fields[0].originalName).toBe('First Name');
      expect(result.fields[1].name).toBe('Last Name');
      expect(result.fields[2].name).toBe('Total Sales');
    });

    it('strips file extension from DataSource name', () => {
      const csv = 'a,b\n1,2\n';

      expect(parseDelimitedString(csv, 'my-data.csv').name).toBe('my-data');
      expect(parseDelimitedString(csv, 'report.tsv').name).toBe('report');
      expect(parseDelimitedString(csv, 'file.data.txt').name).toBe('file.data');
    });
  });
});
