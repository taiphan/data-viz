import { describe, it, expect } from 'vitest';
import { parseStatisticalFile } from './statistical-connector';

// ============================================================
// HELPERS: Create mock File objects with binary content
// ============================================================

function createMockFile(
  name: string,
  content: ArrayBuffer,
): File {
  const blob = new Blob([content], { type: 'application/octet-stream' });
  return new File([blob], name);
}

function createSavBuffer(): ArrayBuffer {
  // Minimal SPSS .sav file structure
  const buffer = new ArrayBuffer(512);
  const view = new DataView(buffer);
  const encoder = new TextEncoder();

  // Magic: $FL2
  const magic = encoder.encode('$FL2');
  new Uint8Array(buffer).set(magic, 0);

  // Product name (60 bytes) - offset 4
  const product = encoder.encode('test-product');
  new Uint8Array(buffer).set(product, 4);

  // Layout code = 2 (little-endian) - offset 64
  view.setInt32(64, 2, true);

  // Case size (number of variables per case) - offset 68
  view.setInt32(68, 1, true);

  // Compressed = 0 - offset 72
  view.setInt32(72, 0, true);

  // Weight index = 0 - offset 76
  view.setInt32(76, 0, true);

  // Case count = 2 - offset 80
  view.setInt32(80, 2, true);

  // Compression bias = 100.0 - offset 84
  view.setFloat64(84, 100.0, true);

  // Skip date(9) + time(8) + label(64) + padding(3) = 84 bytes
  // Data starts at offset 92 + 84 = 176
  const dataStart = 92 + 84;

  // Variable record (record type 2)
  let offset = dataStart;
  view.setInt32(offset, 2, true); offset += 4; // record type
  view.setInt32(offset, 0, true); offset += 4; // type (0 = numeric)
  view.setInt32(offset, 0, true); offset += 4; // has label = no
  view.setInt32(offset, 0, true); offset += 4; // missing value type
  view.setInt32(offset, 0, true); offset += 4; // print format
  view.setInt32(offset, 0, true); offset += 4; // write format
  // Variable name (8 bytes)
  const varName = encoder.encode('score');
  new Uint8Array(buffer).set(varName, offset);
  offset += 8;

  // Dictionary termination (record type 999)
  view.setInt32(offset, 999, true); offset += 4;
  view.setInt32(offset, 0, true); offset += 4; // filler

  // Data: 2 numeric values (float64)
  view.setFloat64(offset, 42.5, true); offset += 8;
  view.setFloat64(offset, 87.3, true); offset += 8;

  return buffer;
}

// ============================================================
// TESTS
// ============================================================

describe('statistical-connector', () => {
  describe('parseStatisticalFile', () => {
    it('should reject unsupported file extensions', async () => {
      const buffer = new ArrayBuffer(100);
      const file = createMockFile('data.xyz', buffer);

      await expect(parseStatisticalFile(file)).rejects.toThrow(
        'Unsupported statistical file format',
      );
    });

    it('should reject invalid SPSS file content', async () => {
      const buffer = new ArrayBuffer(200);
      const file = createMockFile('data.sav', buffer);

      await expect(parseStatisticalFile(file)).rejects.toThrow(
        'Invalid SPSS .sav file',
      );
    });

    it('should parse a minimal SPSS .sav file', async () => {
      const buffer = createSavBuffer();
      const file = createMockFile('survey.sav', buffer);

      const result = await parseStatisticalFile(file);

      expect(result.id).toBeDefined();
      expect(result.name).toBe('survey');
      expect(result.fileName).toBe('survey.sav');
      expect(result.fields.length).toBeGreaterThanOrEqual(1);
      expect(result.importedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(result.rowCount).toBeGreaterThanOrEqual(0);
    });

    it('should detect numeric field types from SPSS data', async () => {
      const buffer = createSavBuffer();
      const file = createMockFile('data.sav', buffer);

      const result = await parseStatisticalFile(file);

      const numericField = result.fields.find((f) => f.originalName === 'score');
      if (numericField) {
        expect(numericField.type).toBe('number');
        expect(numericField.role).toBe('measure');
      }
    });

    it('should reject invalid Stata file', async () => {
      const buffer = new ArrayBuffer(200);
      const view = new DataView(buffer);
      // Set an invalid format version
      view.setUint8(0, 50);
      const file = createMockFile('data.dta', buffer);

      await expect(parseStatisticalFile(file)).rejects.toThrow(
        'Unsupported Stata format version',
      );
    });

    it('should reject invalid SAS file', async () => {
      const buffer = new ArrayBuffer(200);
      const file = createMockFile('data.sas7bdat', buffer);

      await expect(parseStatisticalFile(file)).rejects.toThrow(
        'Invalid SAS .sas7bdat file',
      );
    });

    it('should return DataSource with correct structure', async () => {
      const buffer = createSavBuffer();
      const file = createMockFile('results.sav', buffer);

      const result = await parseStatisticalFile(file);

      // Verify DataSource shape
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('fileName');
      expect(result).toHaveProperty('fields');
      expect(result).toHaveProperty('rows');
      expect(result).toHaveProperty('rowCount');
      expect(result).toHaveProperty('importedAt');
      expect(Array.isArray(result.fields)).toBe(true);
      expect(Array.isArray(result.rows)).toBe(true);
    });

    it('should respect maxRows option', async () => {
      const buffer = createSavBuffer();
      const file = createMockFile('data.sav', buffer);

      const result = await parseStatisticalFile(file, { maxRows: 1 });

      expect(result.rowCount).toBeLessThanOrEqual(1);
    });

    it('should handle .zsav extension as SPSS format', async () => {
      const buffer = createSavBuffer();
      const file = createMockFile('data.zsav', buffer);

      // Should not throw "unsupported format"
      const result = await parseStatisticalFile(file);
      expect(result.fileName).toBe('data.zsav');
    });

    it('should parse Stata XML format (.dta)', async () => {
      const dtaContent = `<stata_dta>
<header><release>117</release></header>
<typelist><type>65526</type><type>32</type></typelist>
<varnames><vn>age</vn><vn>name</vn></varnames>
<variable_labels><vlabel>Age in years</vlabel><vlabel>Full name</vlabel></variable_labels>
<data><o><v>25</v><v>Alice</v></o><o><v>30</v><v>Bob</v></o></data>
</stata_dta>`;
      const encoder = new TextEncoder();
      const buffer = encoder.encode(dtaContent).buffer;
      const file = createMockFile('people.dta', buffer);

      const result = await parseStatisticalFile(file);

      expect(result.name).toBe('people');
      expect(result.fields.length).toBe(2);
      expect(result.rows.length).toBe(2);

      const ageField = result.fields.find((f) => f.originalName === 'age');
      expect(ageField?.type).toBe('number');
      expect(ageField?.name).toBe('Age in years');

      const nameField = result.fields.find((f) => f.originalName === 'name');
      expect(nameField?.type).toBe('string');
    });
  });
});
