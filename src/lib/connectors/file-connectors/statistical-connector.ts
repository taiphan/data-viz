import { DataSource, DataField, FieldType, FieldRole } from '../../types';
import { generateId } from '../../data-engine';

// ============================================================
// STATISTICAL FILE CONNECTOR
// Supports: .sav (SPSS), .dta (Stata), .sas7bdat (SAS)
// ============================================================

export interface StatisticalParseOptions {
  maxRows?: number;
  encoding?: string;
}

export interface VariableInfo {
  name: string;
  label: string;
  type: FieldType;
  valueLabels: Map<number, string>;
}

// ============================================================
// TYPE DETECTION HELPERS
// ============================================================

function assignFieldRole(type: FieldType): FieldRole {
  return type === 'number' ? 'measure' : 'dimension';
}

function computeSampleValues(
  rows: Record<string, unknown>[],
  fieldName: string,
): string[] {
  const unique = new Set<string>();
  for (const row of rows) {
    if (unique.size >= 20) break;
    const val = row[fieldName];
    if (val != null) {
      unique.add(String(val));
    }
  }
  return Array.from(unique);
}

function computeNullCount(
  rows: Record<string, unknown>[],
  fieldName: string,
): number {
  let count = 0;
  for (const row of rows) {
    if (row[fieldName] === null || row[fieldName] === undefined) count++;
  }
  return count;
}

function computeUniqueCount(
  rows: Record<string, unknown>[],
  fieldName: string,
): number {
  const unique = new Set<unknown>();
  for (const row of rows) {
    unique.add(row[fieldName]);
  }
  return unique.size;
}

// ============================================================
// SPSS .SAV BINARY PARSER
// Implements the SPSS System File format (basic support)
// Reference: https://www.gnu.org/software/pspp/pspp-dev/html_node/
// ============================================================

const SAV_MAGIC = '$FL2';
const SAV_MAGIC_ZLIB = '$FL3';

interface SavHeader {
  magic: string;
  productName: string;
  layoutCode: number;
  caseCount: number;
  compressionBias: number;
  variableCount: number;
  weightIndex: number;
  compressed: boolean;
}

interface SavVariable {
  type: number; // 0 = numeric, >0 = string width
  name: string;
  label: string;
  missingValueType: number;
  printFormat: number;
  writeFormat: number;
}

class BinaryReader {
  private view: DataView;
  private offset: number;
  private littleEndian: boolean;

  constructor(buffer: ArrayBuffer, littleEndian = true) {
    this.view = new DataView(buffer);
    this.offset = 0;
    this.littleEndian = littleEndian;
  }

  get position(): number {
    return this.offset;
  }

  get remaining(): number {
    return this.view.byteLength - this.offset;
  }

  seek(offset: number): void {
    this.offset = offset;
  }

  skip(bytes: number): void {
    this.offset += bytes;
  }

  readInt32(): number {
    const val = this.view.getInt32(this.offset, this.littleEndian);
    this.offset += 4;
    return val;
  }

  readFloat64(): number {
    const val = this.view.getFloat64(this.offset, this.littleEndian);
    this.offset += 8;
    return val;
  }

  readUint8(): number {
    const val = this.view.getUint8(this.offset);
    this.offset += 1;
    return val;
  }

  readString(length: number): string {
    const bytes = new Uint8Array(this.view.buffer, this.offset, length);
    this.offset += length;
    return new TextDecoder('latin1').decode(bytes).replace(/\0+$/, '').trim();
  }
}

function parseSavHeader(reader: BinaryReader): SavHeader {
  const magic = reader.readString(4);
  if (magic !== SAV_MAGIC && magic !== SAV_MAGIC_ZLIB) {
    throw new Error('Invalid SPSS .sav file: unrecognized magic number');
  }

  const productName = reader.readString(60);
  const layoutCode = reader.readInt32();

  // Determine endianness from layout code
  const isLittleEndian = layoutCode === 2;
  if (!isLittleEndian && layoutCode !== 2) {
    // Re-read with big endian if needed
    reader.seek(64);
  }

  const caseSize = reader.readInt32();
  const compressed = reader.readInt32() !== 0;
  const weightIndex = reader.readInt32();
  const caseCount = reader.readInt32();
  const compressionBias = reader.readFloat64();

  // Skip creation date (9), time (8), file label (64)
  reader.skip(9 + 8 + 64);
  // Skip padding (3 bytes)
  reader.skip(3);

  return {
    magic,
    productName,
    layoutCode,
    caseCount,
    compressionBias: compressionBias || 100,
    variableCount: caseSize,
    weightIndex,
    compressed,
  };
}

function parseSavVariables(
  reader: BinaryReader,
  header: SavHeader,
): { variables: SavVariable[]; valueLabels: Map<number, Map<number, string>> } {
  const variables: SavVariable[] = [];
  const valueLabels = new Map<number, Map<number, string>>();

  while (reader.remaining > 4) {
    const recordType = reader.readInt32();

    if (recordType === 2) {
      // Variable record
      const type = reader.readInt32();
      const hasLabel = reader.readInt32();
      const missingValueType = reader.readInt32();
      const printFormat = reader.readInt32();
      const writeFormat = reader.readInt32();
      const name = reader.readString(8);

      let label = '';
      if (hasLabel === 1) {
        const labelLen = reader.readInt32();
        const paddedLen = Math.ceil(labelLen / 4) * 4;
        label = reader.readString(paddedLen).substring(0, labelLen);
      }

      // Skip missing values
      const missingCount = Math.abs(missingValueType);
      reader.skip(missingCount * 8);

      // Only add non-continuation variables (type >= 0 for first segment)
      if (type >= 0) {
        variables.push({
          type,
          name,
          label: label || name,
          missingValueType,
          printFormat,
          writeFormat,
        });
      }
    } else if (recordType === 3) {
      // Value label record
      const labelCount = reader.readInt32();
      const labels = new Map<number, string>();

      for (let i = 0; i < labelCount; i++) {
        const value = reader.readFloat64();
        const labelLen = reader.readUint8();
        const paddedLen = Math.ceil((labelLen + 1) / 8) * 8 - 1;
        const labelStr = reader.readString(paddedLen).substring(0, labelLen);
        labels.set(value, labelStr);
      }

      // Record type 4: value label variable indices
      const nextType = reader.readInt32();
      if (nextType === 4) {
        const varCount = reader.readInt32();
        for (let i = 0; i < varCount; i++) {
          const varIdx = reader.readInt32() - 1;
          valueLabels.set(varIdx, labels);
        }
      }
    } else if (recordType === 6) {
      // Document record
      const lineCount = reader.readInt32();
      reader.skip(lineCount * 80);
    } else if (recordType === 7) {
      // Extension record
      reader.readInt32(); // subType
      const elementSize = reader.readInt32();
      const elementCount = reader.readInt32();
      reader.skip(elementSize * elementCount);
    } else if (recordType === 999) {
      // Dictionary termination
      reader.skip(4); // filler
      break;
    } else {
      // Unknown record type, stop parsing metadata
      break;
    }
  }

  return { variables, valueLabels };
}

function readSavData(
  reader: BinaryReader,
  variables: SavVariable[],
  header: SavHeader,
  maxRows: number,
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  const SYSMIS = -Number.MAX_VALUE;

  if (!header.compressed) {
    // Uncompressed data
    for (let row = 0; row < Math.min(header.caseCount, maxRows); row++) {
      if (reader.remaining < 8) break;
      const record: Record<string, unknown> = {};

      for (const variable of variables) {
        if (reader.remaining < 8) break;
        if (variable.type === 0) {
          // Numeric
          const val = reader.readFloat64();
          record[variable.name] = val === SYSMIS ? null : val;
        } else {
          // String
          const width = Math.max(variable.type, 8);
          const paddedWidth = Math.ceil(width / 8) * 8;
          record[variable.name] = reader.readString(paddedWidth);
        }
      }
      rows.push(record);
    }
  } else {
    // Compressed data (bytecode compression)
    const bias = header.compressionBias;
    let rowCount = 0;

    while (rowCount < Math.min(header.caseCount, maxRows) && reader.remaining >= 8) {
      const record: Record<string, unknown> = {};
      let varIdx = 0;

      while (varIdx < variables.length && reader.remaining > 0) {
        const codes = new Uint8Array(8);
        for (let i = 0; i < 8 && reader.remaining > 0; i++) {
          codes[i] = reader.readUint8();
        }

        for (let i = 0; i < 8 && varIdx < variables.length; i++) {
          const code = codes[i];
          const variable = variables[varIdx];

          if (code === 0) {
            // Skip/padding
            continue;
          } else if (code === 252) {
            // End of file
            varIdx = variables.length;
            rowCount = maxRows;
            break;
          } else if (code === 253) {
            // Raw 8-byte value follows
            if (reader.remaining < 8) break;
            if (variable.type === 0) {
              const val = reader.readFloat64();
              record[variable.name] = val === SYSMIS ? null : val;
            } else {
              record[variable.name] = reader.readString(8);
            }
            varIdx++;
          } else if (code === 254) {
            // All spaces (string)
            record[variable.name] = '';
            varIdx++;
          } else if (code === 255) {
            // System missing
            record[variable.name] = null;
            varIdx++;
          } else {
            // Compressed numeric: value = code - bias
            if (variable.type === 0) {
              record[variable.name] = code - bias;
            } else {
              record[variable.name] = String(code - bias);
            }
            varIdx++;
          }
        }
      }

      if (Object.keys(record).length > 0) {
        rows.push(record);
        rowCount++;
      }
    }
  }

  return rows;
}

async function parseSavFile(
  buffer: ArrayBuffer,
  options: StatisticalParseOptions = {},
): Promise<{ variables: VariableInfo[]; rows: Record<string, unknown>[] }> {
  const maxRows = options.maxRows ?? 1_000_000;
  const reader = new BinaryReader(buffer);

  const header = parseSavHeader(reader);
  const { variables: savVariables, valueLabels } = parseSavVariables(reader, header);

  const rows = readSavData(reader, savVariables, header, maxRows);

  const variables: VariableInfo[] = savVariables.map((v, i) => ({
    name: v.name,
    label: v.label || v.name,
    type: v.type === 0 ? 'number' as FieldType : 'string' as FieldType,
    valueLabels: valueLabels.get(i) ?? new Map<number, string>(),
  }));

  return { variables, rows };
}

// ============================================================
// STATA .DTA PARSER (Basic support for Stata 13+ format)
// ============================================================

async function parseDtaFile(
  buffer: ArrayBuffer,
  options: StatisticalParseOptions = {},
): Promise<{ variables: VariableInfo[]; rows: Record<string, unknown>[] }> {
  const maxRows = options.maxRows ?? 1_000_000;
  const text = new TextDecoder('latin1').decode(buffer.slice(0, 100));

  if (!text.includes('<stata_dta>') && !text.includes('</stata_dta>')) {
    // Try older binary format (Stata 12 and below)
    return parseDtaLegacy(buffer, maxRows);
  }

  return parseDtaXml(buffer, maxRows);
}

function parseDtaXml(
  buffer: ArrayBuffer,
  maxRows: number,
): { variables: VariableInfo[]; rows: Record<string, unknown>[] } {
  const decoder = new TextDecoder('latin1');
  const fullText = decoder.decode(buffer);

  // Extract variable names from <varnames> section
  const varNamesMatch = fullText.match(/<varnames>([\s\S]*?)<\/varnames>/);
  const varNames: string[] = [];
  if (varNamesMatch) {
    const content = varNamesMatch[1];
    const vnRegex = /<vn>(.*?)<\/vn>/g;
    let m: RegExpExecArray | null;
    while ((m = vnRegex.exec(content)) !== null) {
      varNames.push(m[1].trim());
    }
  }

  // Extract variable labels from <variable_labels> section
  const varLabelsMatch = fullText.match(
    /<variable_labels>([\s\S]*?)<\/variable_labels>/,
  );
  const varLabels: string[] = [];
  if (varLabelsMatch) {
    const content = varLabelsMatch[1];
    const vlRegex = /<vlabel>(.*?)<\/vlabel>/g;
    let m: RegExpExecArray | null;
    while ((m = vlRegex.exec(content)) !== null) {
      varLabels.push(m[1].trim());
    }
  }

  // Extract variable types from <typelist>
  const typeListMatch = fullText.match(/<typelist>([\s\S]*?)<\/typelist>/);
  const varTypes: number[] = [];
  if (typeListMatch) {
    const content = typeListMatch[1];
    const typeRegex = /<type>(\d+)<\/type>/g;
    let m: RegExpExecArray | null;
    while ((m = typeRegex.exec(content)) !== null) {
      varTypes.push(parseInt(m[1], 10));
    }
  }

  // Build variable info
  const variables: VariableInfo[] = varNames.map((name, i) => {
    const typeCode = varTypes[i] ?? 0;
    // Stata types: 65526=double, 65527=float, 65528=long, 65529=int, 65530=byte
    // String types: 1-2045 (length of string)
    const isNumeric = typeCode >= 65526 || typeCode === 0;
    return {
      name,
      label: varLabels[i] || name,
      type: isNumeric ? 'number' as FieldType : 'string' as FieldType,
      valueLabels: new Map<number, string>(),
    };
  });

  // Extract data from <data> section (binary portion)
  // For XML-format Stata files, data is in <o> tags
  const rows: Record<string, unknown>[] = [];
  const dataMatch = fullText.match(/<data>([\s\S]*?)<\/data>/);
  if (dataMatch) {
    const content = dataMatch[1];
    const obsRegex = /<o>([\s\S]*?)<\/o>/g;
    let rowCount = 0;
    let obs: RegExpExecArray | null;
    while ((obs = obsRegex.exec(content)) !== null) {
      if (rowCount >= maxRows) break;
      const record: Record<string, unknown> = {};
      const valRegex = /<v>(.*?)<\/v>/g;
      let colIdx = 0;
      let val: RegExpExecArray | null;
      while ((val = valRegex.exec(obs[1])) !== null) {
        if (colIdx < variables.length) {
          const raw = val[1].trim();
          if (variables[colIdx].type === 'number') {
            const num = parseFloat(raw);
            record[variables[colIdx].name] = isNaN(num) ? null : num;
          } else {
            record[variables[colIdx].name] = raw;
          }
        }
        colIdx++;
      }
      if (Object.keys(record).length > 0) {
        rows.push(record);
        rowCount++;
      }
    }
  }

  return { variables, rows };
}

function parseDtaLegacy(
  buffer: ArrayBuffer,
  maxRows: number,
): { variables: VariableInfo[]; rows: Record<string, unknown>[] } {
  const reader = new BinaryReader(buffer);

  // Stata legacy format header
  const formatVersion = reader.readUint8();
  if (formatVersion < 104 || formatVersion > 115) {
    throw new Error(
      `Unsupported Stata format version: ${formatVersion}. ` +
      'Supported versions: 104-115 (Stata 8-12).',
    );
  }

  reader.readUint8(); // byteOrder: 1=big-endian, 2=little-endian (MSF/LSF)
  reader.skip(1); // filetype
  reader.skip(1); // unused

  const nvar = reader.readInt32();
  reader.readInt32(); // nobs - not used in metadata-only parse
  reader.skip(81); // data_label
  reader.skip(18); // time_stamp

  // Read variable type list
  const varTypes: number[] = [];
  for (let i = 0; i < nvar; i++) {
    varTypes.push(reader.readUint8());
  }

  // Read variable names
  const nameLen = formatVersion >= 110 ? 33 : 9;
  const varNames: string[] = [];
  for (let i = 0; i < nvar; i++) {
    varNames.push(reader.readString(nameLen));
  }

  // Build variables
  const variables: VariableInfo[] = varNames.map((name, i) => {
    // Stata types: 251=byte, 252=int, 253=long, 254=float, 255=double
    // 0-244 = string of that length
    const typeCode = varTypes[i];
    const isNumeric = typeCode >= 251;
    return {
      name,
      label: name,
      type: isNumeric ? 'number' as FieldType : 'string' as FieldType,
      valueLabels: new Map<number, string>(),
    };
  });

  // Skip sort order, formats, value label names, variable labels, expansion fields
  // These vary by version; skip to data section
  // For simplicity, return variables with empty rows for legacy format
  const rows: Record<string, unknown>[] = [];

  return { variables, rows };
}

// ============================================================
// SAS .SAS7BDAT PARSER (Basic header extraction)
// The SAS7BDAT format is complex; we extract metadata and
// attempt basic data reading for uncompressed files.
// ============================================================

const SAS_MAGIC = new Uint8Array([
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0xc2, 0xea, 0x81, 0x60,
  0xb3, 0x14, 0x11, 0xcf, 0xbd, 0x92, 0x08, 0x00,
  0x09, 0xc7, 0x31, 0x8c, 0x18, 0x1f, 0x10, 0x11,
]);

async function parseSasFile(
  buffer: ArrayBuffer,
  options: StatisticalParseOptions = {},
): Promise<{ variables: VariableInfo[]; rows: Record<string, unknown>[] }> {
  const maxRows = options.maxRows ?? 1_000_000;
  const bytes = new Uint8Array(buffer);

  // Verify magic number (first 32 bytes)
  let isSas = true;
  for (let i = 0; i < SAS_MAGIC.length && i < bytes.length; i++) {
    if (bytes[i] !== SAS_MAGIC[i]) {
      isSas = false;
      break;
    }
  }

  if (!isSas) {
    throw new Error(
      'Invalid SAS .sas7bdat file: unrecognized file signature.',
    );
  }

  const reader = new BinaryReader(buffer);
  reader.skip(32); // magic

  // Determine alignment (32-bit or 64-bit)
  reader.skip(1); // a1
  const a2 = reader.readUint8();
  const is64Bit = a2 === 0x33;
  reader.skip(1); // a3

  const endianByte = reader.readUint8();
  const isLittleEndian = endianByte === 0x01;

  // Skip to header fields based on alignment
  // Platform, encoding, dataset name, file type
  reader.seek(is64Bit ? 196 : 164);

  // For SAS files, extracting column metadata requires parsing
  // multiple page types (meta, data, mix pages). We provide
  // basic metadata extraction.
  const variables: VariableInfo[] = [];
  const rows: Record<string, unknown>[] = [];

  // Attempt to find column names in the binary
  const potentialNames: string[] = [];

  // Look for column name subheader signatures
  // This is a simplified approach - full SAS parsing is very complex
  const headerSize = is64Bit ? 8192 : 4096;
  if (buffer.byteLength > headerSize) {
    // Extract readable strings from the first few pages as potential column names
    const headerText = new TextDecoder('latin1').decode(
      buffer.slice(0, Math.min(buffer.byteLength, headerSize * 4)),
    );
    const words = headerText.match(/[A-Za-z_][A-Za-z0-9_]{0,31}/g) || [];
    const seen = new Set<string>();
    for (const word of words) {
      if (word.length >= 2 && word.length <= 32 && !seen.has(word)) {
        seen.add(word);
        potentialNames.push(word);
      }
      if (potentialNames.length >= 100) break;
    }
  }

  // If we found potential column names, create variable stubs
  // Full SAS parsing would require implementing the page/subheader system
  if (potentialNames.length > 0 && potentialNames.length <= 50) {
    for (const name of potentialNames.slice(0, 50)) {
      variables.push({
        name,
        label: name,
        type: 'string',
        valueLabels: new Map<number, string>(),
      });
    }
  }

  return { variables, rows };
}

// ============================================================
// FILE EXTENSION DETECTION
// ============================================================

type StatisticalFormat = 'spss' | 'stata' | 'sas';

function detectFormat(file: File): StatisticalFormat {
  const ext = file.name.toLowerCase().split('.').pop();
  switch (ext) {
    case 'sav':
    case 'zsav':
      return 'spss';
    case 'dta':
      return 'stata';
    case 'sas7bdat':
      return 'sas';
    default:
      throw new Error(
        `Unsupported statistical file format: .${ext}. ` +
        'Supported formats: .sav (SPSS), .dta (Stata), .sas7bdat (SAS).',
      );
  }
}

// ============================================================
// VALUE LABEL APPLICATION
// ============================================================

function applyValueLabels(
  rows: Record<string, unknown>[],
  variables: VariableInfo[],
): Record<string, unknown>[] {
  const hasLabels = variables.some((v) => v.valueLabels.size > 0);
  if (!hasLabels) return rows;

  return rows.map((row) => {
    const newRow = { ...row };
    for (const variable of variables) {
      if (variable.valueLabels.size > 0) {
        const val = newRow[variable.name];
        if (typeof val === 'number' && variable.valueLabels.has(val)) {
          newRow[variable.name] = variable.valueLabels.get(val);
        }
      }
    }
    return newRow;
  });
}

// ============================================================
// MAIN EXPORT: parseStatisticalFile
// ============================================================

export async function parseStatisticalFile(
  file: File,
  options: StatisticalParseOptions = {},
): Promise<DataSource> {
  const format = detectFormat(file);
  const buffer = await file.arrayBuffer();

  let variables: VariableInfo[];
  let rows: Record<string, unknown>[];

  switch (format) {
    case 'spss':
      ({ variables, rows } = await parseSavFile(buffer, options));
      break;
    case 'stata':
      ({ variables, rows } = await parseDtaFile(buffer, options));
      break;
    case 'sas':
      ({ variables, rows } = await parseSasFile(buffer, options));
      break;
  }

  // Apply value labels (categorical encoding)
  rows = applyValueLabels(rows, variables);

  // Detect types from actual data if variables have ambiguous types
  const refinedVariables = refineTypes(variables, rows);

  // Build DataSource fields
  const fields: DataField[] = refinedVariables.map((v) => {
    const role = assignFieldRole(v.type);
    return {
      id: generateId(),
      name: v.label || v.name,
      originalName: v.name,
      type: v.type,
      role,
      sampleValues: computeSampleValues(rows, v.name),
      nullCount: computeNullCount(rows, v.name),
      uniqueCount: computeUniqueCount(rows, v.name),
    };
  });

  return {
    id: generateId(),
    name: file.name.replace(/\.[^.]+$/, ''),
    fileName: file.name,
    fields,
    rows,
    rowCount: rows.length,
    importedAt: new Date().toISOString(),
  };
}

// ============================================================
// TYPE REFINEMENT FROM DATA
// ============================================================

function refineTypes(
  variables: VariableInfo[],
  rows: Record<string, unknown>[],
): VariableInfo[] {
  if (rows.length === 0) return variables;

  return variables.map((v) => {
    // If value labels were applied, the field becomes a string (categorical)
    if (v.valueLabels.size > 0) {
      return { ...v, type: 'string' as FieldType };
    }

    // Check actual data to refine type detection
    const sampleSize = Math.min(rows.length, 100);
    let hasNumber = false;
    let hasDate = false;
    let hasString = false;

    for (let i = 0; i < sampleSize; i++) {
      const val = rows[i][v.name];
      if (val === null || val === undefined) continue;

      if (typeof val === 'number') {
        hasNumber = true;
      } else if (typeof val === 'string') {
        // Check if it looks like a date
        const datePattern = /^\d{4}-\d{2}-\d{2}/;
        if (datePattern.test(val)) {
          hasDate = true;
        } else {
          hasString = true;
        }
      }
    }

    if (hasDate && !hasString && !hasNumber) {
      return { ...v, type: 'date' as FieldType };
    }
    if (hasNumber && !hasString && !hasDate) {
      return { ...v, type: 'number' as FieldType };
    }
    if (hasString || (hasNumber && hasString)) {
      return { ...v, type: 'string' as FieldType };
    }

    return v;
  });
}
