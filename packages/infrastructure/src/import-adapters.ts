import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import type { ImportSourceParserPort, ImportSourceStoragePort, ParsedImportSource } from '@insurance/application/governed-imports';

const CSV_MEDIA = 'text/csv';
const XLSX_MEDIA = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ZIP_LOCAL_FILE = 0x04034b50;
const ZIP_CENTRAL_FILE = 0x02014b50;
const ZIP_EOCD = 0x06054b50;
const MAX_XLSX_ENTRY_BYTES = 16 * 1024 * 1024;
const MAX_XLSX_TOTAL_BYTES = 64 * 1024 * 1024;

function sourceError(message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code: 'IMPORT_SOURCE_INVALID' });
}

function safeDisplayName(name: string): string {
  const leaf = basename(name || 'import-source').replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120);
  return leaf || 'import-source';
}

function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"' && cell.length === 0) {
      quoted = true;
      continue;
    }
    if (char === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }
  if (quoted) throw sourceError('CSV contains an unterminated quoted field.');
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  while (rows.length && rows.at(-1)!.every((value) => value === '')) rows.pop();
  return rows;
}

function tableToParsed(table: string[][]): ParsedImportSource {
  if (!table.length) throw sourceError('Import source does not contain a header row.');
  const headers = table[0]!.map((value) => value.trim());
  if (!headers.length || headers.every((value) => !value)) throw sourceError('Import source does not contain usable headers.');
  const rows: Record<string, string>[] = [];
  for (let rowIndex = 1; rowIndex < table.length; rowIndex += 1) {
    const values = table[rowIndex]!;
    if (values.slice(headers.length).some((value) => value.trim() !== '')) {
      throw sourceError(`Row ${rowIndex + 1} contains values beyond the declared header columns.`);
    }
    if (values.every((value) => value.trim() === '')) continue;
    rows.push(Object.fromEntries(headers.map((header, columnIndex) => [header, values[columnIndex] ?? ''])));
  }
  return { headers, rows };
}

function parseCsv(bytes: Uint8Array): ParsedImportSource {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw sourceError('CSV source must be valid UTF-8 text.');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text.includes('\u0000')) throw sourceError('CSV source contains binary NUL data.');
  return tableToParsed(parseCsvText(text));
}

interface ZipEntry {
  name: string;
  compressionMethod: number;
  flags: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

function findEocd(buffer: Buffer): number {
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === ZIP_EOCD) return offset;
  }
  throw sourceError('XLSX source does not contain a valid ZIP end record.');
}

function zipEntries(bytes: Uint8Array): Map<string, Buffer> {
  const buffer = Buffer.from(bytes);
  if (buffer.length < 22 || buffer.readUInt32LE(0) !== ZIP_LOCAL_FILE) throw sourceError('XLSX source does not have a valid ZIP signature.');
  const eocd = findEocd(buffer);
  const disk = buffer.readUInt16LE(eocd + 4);
  const centralDisk = buffer.readUInt16LE(eocd + 6);
  const entriesOnDisk = buffer.readUInt16LE(eocd + 8);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) throw sourceError('Multi-disk XLSX archives are not supported.');
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) throw sourceError('ZIP64 XLSX archives are outside the demo import contract.');
  if (centralOffset + centralSize > buffer.length) throw sourceError('XLSX central directory is outside the source bounds.');

  const metadata: ZipEntry[] = [];
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== ZIP_CENTRAL_FILE) throw sourceError('XLSX central directory is malformed.');
    const flags = buffer.readUInt16LE(offset + 8);
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    if ([compressedSize, uncompressedSize, localHeaderOffset].includes(0xffffffff)) throw sourceError('ZIP64 XLSX entries are outside the demo import contract.');
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > buffer.length) throw sourceError('XLSX entry name exceeds archive bounds.');
    const name = buffer.subarray(nameStart, nameEnd).toString('utf8').replaceAll('\\', '/');
    if (!name || name.includes('../') || name.startsWith('/') || name.includes('\u0000')) throw sourceError('XLSX contains an unsafe archive entry name.');
    if ((flags & 0x0001) !== 0) throw sourceError('Encrypted XLSX entries are not supported.');
    if (compressionMethod !== 0 && compressionMethod !== 8) throw sourceError('XLSX uses an unsupported ZIP compression method.');
    if (uncompressedSize > MAX_XLSX_ENTRY_BYTES) throw sourceError('XLSX contains an entry exceeding the decompression safety limit.');
    metadata.push({ name, flags, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset });
    offset = nameEnd + extraLength + commentLength;
  }
  if (metadata.some((entry) => /(^|\/)(vbaProject|.*\.bin$)/i.test(entry.name))) {
    throw sourceError('Macro/binary workbook content is not accepted by the XLSX importer.');
  }
  const totalDeclared = metadata.reduce((sum, entry) => sum + entry.uncompressedSize, 0);
  if (totalDeclared > MAX_XLSX_TOTAL_BYTES) throw sourceError('XLSX exceeds the decompression safety limit.');

  const result = new Map<string, Buffer>();
  let totalActual = 0;
  for (const entry of metadata) {
    const local = entry.localHeaderOffset;
    if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== ZIP_LOCAL_FILE) throw sourceError('XLSX local file header is malformed.');
    const localNameLength = buffer.readUInt16LE(local + 26);
    const localExtraLength = buffer.readUInt16LE(local + 28);
    const dataStart = local + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + entry.compressedSize;
    if (dataEnd > buffer.length) throw sourceError('XLSX compressed entry exceeds source bounds.');
    const compressed = buffer.subarray(dataStart, dataEnd);
    let content: Buffer;
    try {
      content = entry.compressionMethod === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: MAX_XLSX_ENTRY_BYTES + 1 });
    } catch {
      throw sourceError('XLSX compressed entry cannot be decoded safely.');
    }
    if (content.length !== entry.uncompressedSize || content.length > MAX_XLSX_ENTRY_BYTES) throw sourceError('XLSX entry size does not match its declared size.');
    totalActual += content.length;
    if (totalActual > MAX_XLSX_TOTAL_BYTES) throw sourceError('XLSX exceeds the decompression safety limit.');
    result.set(entry.name, content);
  }
  return result;
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_match, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function xmlTextNodes(xml: string): string {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((match) => decodeXmlText(match[1] ?? '')).join('');
}

function sharedStrings(entries: Map<string, Buffer>): string[] {
  const content = entries.get('xl/sharedStrings.xml');
  if (!content) return [];
  const xml = content.toString('utf8');
  return [...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((match) => xmlTextNodes(match[1] ?? ''));
}

function columnIndex(reference: string): number {
  const match = /^([A-Z]+)[0-9]+$/i.exec(reference);
  if (!match) throw sourceError('XLSX contains a cell with an invalid reference.');
  let result = 0;
  for (const char of match[1]!.toUpperCase()) result = result * 26 + (char.charCodeAt(0) - 64);
  return result - 1;
}

function cellValue(cellXml: string, type: string | undefined, strings: readonly string[]): string {
  const formulaMatch = /<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/.exec(cellXml);
  if (formulaMatch) return `=${decodeXmlText(formulaMatch[1] ?? '')}`;
  if (type === 'inlineStr') return xmlTextNodes(cellXml);
  const valueMatch = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(cellXml);
  const raw = decodeXmlText(valueMatch?.[1] ?? '');
  if (type === 's') {
    const index = Number.parseInt(raw, 10);
    if (!Number.isInteger(index) || index < 0 || index >= strings.length) throw sourceError('XLSX references an invalid shared string index.');
    return strings[index]!;
  }
  if (type === 'b') return raw === '1' ? 'TRUE' : raw === '0' ? 'FALSE' : raw;
  return raw;
}

function parseWorksheet(xml: string, strings: readonly string[]): string[][] {
  const result: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)) {
    const rowXml = rowMatch[1] ?? '';
    const row: string[] = [];
    for (const cellMatch of rowXml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1] ?? '';
      const ref = /\br="([^"]+)"/.exec(attrs)?.[1];
      if (!ref) throw sourceError('XLSX cell is missing its coordinate reference.');
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const index = columnIndex(ref);
      if (index > 10_000) throw sourceError('XLSX contains an unreasonable column index.');
      row[index] = cellValue(cellMatch[2] ?? '', type, strings);
    }
    result.push(Array.from({ length: row.length }, (_value, index) => row[index] ?? ''));
  }
  return result;
}

function parseXlsx(bytes: Uint8Array): ParsedImportSource {
  const entries = zipEntries(bytes);
  const worksheetName = [...entries.keys()]
    .filter((name) => /^xl\/worksheets\/sheet[0-9]+\.xml$/i.test(name))
    .sort((a, b) => {
      const left = Number(/sheet([0-9]+)/i.exec(a)?.[1] ?? Number.MAX_SAFE_INTEGER);
      const right = Number(/sheet([0-9]+)/i.exec(b)?.[1] ?? Number.MAX_SAFE_INTEGER);
      return left - right || a.localeCompare(b);
    })[0];
  if (!worksheetName) throw sourceError('XLSX does not contain a readable worksheet.');
  const worksheet = entries.get(worksheetName)!;
  const xml = worksheet.toString('utf8');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw sourceError('XLSX worksheet contains unsupported XML declarations.');
  return tableToParsed(parseWorksheet(xml, sharedStrings(entries)));
}

export class SafeImportSourceParser implements ImportSourceParserPort {
  async parse(input: { bytes: Uint8Array; mediaType: string }): Promise<ParsedImportSource> {
    if (input.mediaType === CSV_MEDIA) return parseCsv(input.bytes);
    if (input.mediaType === XLSX_MEDIA) return parseXlsx(input.bytes);
    throw Object.assign(new Error('Import source media type is not supported.'), { code: 'IMPORT_SOURCE_UNSUPPORTED' });
  }
}

export class LocalPrivateImportSourceStorage implements ImportSourceStoragePort {
  constructor(private readonly root: string) {}
  async stage(input: { importJobId: string; bytes: Uint8Array; mediaType: string; originalName: string }) {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const storageKey = `${input.importJobId}-${randomBytes(16).toString('hex')}`;
    await writeFile(join(this.root, storageKey), input.bytes, { mode: 0o600 });
    return { storageKey, displayFilename: safeDisplayName(input.originalName) };
  }
  read(storageKey: string): Promise<Uint8Array> {
    if (!/^[a-zA-Z0-9-]+$/.test(storageKey)) return Promise.reject(sourceError('Import source storage key is invalid.'));
    return readFile(join(this.root, storageKey));
  }
  async cleanup(storageKey: string): Promise<void> {
    if (!/^[a-zA-Z0-9-]+$/.test(storageKey)) return;
    await rm(join(this.root, storageKey), { force: true });
  }
}

export class MemoryImportSourceStorage implements ImportSourceStoragePort {
  private readonly files = new Map<string, Uint8Array>();
  async stage(input: { importJobId: string; bytes: Uint8Array; mediaType: string; originalName: string }) {
    const storageKey = `memory-${input.importJobId}-${randomBytes(6).toString('hex')}`;
    this.files.set(storageKey, Uint8Array.from(input.bytes));
    return { storageKey, displayFilename: safeDisplayName(input.originalName) };
  }
  async read(storageKey: string): Promise<Uint8Array> {
    const bytes = this.files.get(storageKey);
    if (!bytes) throw sourceError('Import source was not found in private storage.');
    return Uint8Array.from(bytes);
  }
  async cleanup(storageKey: string): Promise<void> { this.files.delete(storageKey); }
}
