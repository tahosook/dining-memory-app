/**
 * Database Benchmark Script: Meals Query Pagination & Composite Index Analysis
 *
 * Simulates local SQLite environment matching Dining Memory App schema (Version 2).
 * Evaluates performance characteristics for:
 * - Case 1: Production getRecentMeals OFFSET pagination (LIMIT 20 OFFSET 5000)
 * - Case 1-search: Production searchMeals representative query (LIMIT 20 OFFSET 5000)
 * - Case 2: Production getRecentMeals Keyset pagination with proper composite tie-breaker
 *           (WHERE is_deleted = 0 AND (meal_datetime < ? OR (meal_datetime = ? AND id < ?)) ORDER BY meal_datetime DESC, id DESC LIMIT 20)
 * - Case 2-err: Erroneous Keyset condition (WHERE meal_datetime < ? AND id < ? ORDER BY meal_datetime DESC LIMIT 20)
 * - Case 3: Composite index (idx_meals_datetime_deleted) impact on sorting and scan costs
 *
 * Dataset sizes: 1,000 / 5,000 / 10,000 / 20,000 records
 * Iterations: 100 runs per query (after 10 warmup runs)
 */

import { DatabaseSync } from 'node:sqlite';

export interface QueryPlanDetail {
  id: number;
  parent: number;
  notused: number;
  detail: string;
}

export interface MetricStats {
  avgMs: number;
  medianMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
}

export interface BenchmarkRecord {
  caseCode: string;
  caseTitle: string;
  config: string;
  sql: string;
  rowCount: number;
  queryPlan: string[];
  hasTempBTree: boolean;
  hasScanTable: boolean;
  indexUsed: string;
  returnedRows: number;
  stats: MetricStats;
}

export interface OffsetDepthRecord {
  offset: number;
  configA_BaselineMs: number;
  configB_CompositeOffsetMs: number;
  configB_CompositeKeysetMs: number;
}

const SCHEMA_V2_SQL = `
CREATE TABLE meals (
  id TEXT PRIMARY KEY NOT NULL,
  uuid TEXT NOT NULL,
  meal_name TEXT NOT NULL,
  meal_type TEXT,
  cuisine_type TEXT,
  ai_confidence REAL,
  ai_source TEXT,
  notes TEXT,
  cooking_level TEXT,
  is_homemade INTEGER NOT NULL DEFAULT 0,
  photo_path TEXT NOT NULL,
  photo_thumbnail_path TEXT,
  location_name TEXT,
  latitude REAL,
  longitude REAL,
  meal_datetime INTEGER NOT NULL,
  search_text TEXT,
  tags TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_meals_meal_datetime ON meals(meal_datetime);
CREATE INDEX idx_meals_location_name ON meals(location_name);
CREATE INDEX idx_meals_is_deleted ON meals(is_deleted);
CREATE INDEX idx_meals_search_text ON meals(search_text);
`;

// Composite index supporting both meal_datetime and id ordering for tie-breaking
const COMPOSITE_INDEX_SQL = `
CREATE INDEX idx_meals_datetime_deleted ON meals(is_deleted, meal_datetime DESC, id DESC);
`;

export function setupDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA_V2_SQL);
  return db;
}

export function seedMealsData(
  db: DatabaseSync,
  count: number
): {
  baseTime: number;
  cursorDatetime: number;
  cursorId: string;
  duplicateTimestampCount: number;
} {
  const insertStmt = db.prepare(`
    INSERT INTO meals (
      id, uuid, meal_name, meal_type, cuisine_type, ai_confidence, ai_source,
      notes, cooking_level, is_homemade, photo_path, photo_thumbnail_path,
      location_name, latitude, longitude, meal_datetime, search_text,
      tags, is_deleted, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?
    )
  `);

  const baseTime = 1750000000000;
  const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
  const cuisines = ['japanese', 'western', 'chinese', 'italian', 'korean'] as const;
  const locations = ['Home', 'Tokyo Station Diner', 'Shibuya Cafe', 'Ramen Shop', 'Office Cafeteria'];

  const targetIndex = Math.min(5000, Math.max(0, Math.floor(count / 2)));
  let cursorDatetime = 0;
  let cursorId = '';
  let duplicateTimestampCount = 0;

  db.exec('BEGIN TRANSACTION;');

  let currentDatetime = baseTime;
  for (let i = 0; i < count; i++) {
    const id = `meal-${String(i).padStart(7, '0')}`;
    const uuid = `uuid-${String(i).padStart(7, '0')}`;
    const mealName = `Sample Meal ${i}`;
    const mealType = mealTypes[i % mealTypes.length];
    const cuisineType = cuisines[i % cuisines.length];
    const locationName = locations[i % locations.length];

    // Every 5th item shares the timestamp of the preceding item to simulate multiple meals at identical datetime
    if (i > 0 && i % 5 === 0) {
      duplicateTimestampCount++;
    } else {
      currentDatetime -= 4 * 3600 * 1000;
    }

    const isDeleted = i % 20 === 0 ? 1 : 0; // ~5% soft deleted
    const createdAt = currentDatetime;
    const updatedAt = currentDatetime;

    if (i === targetIndex) {
      cursorDatetime = currentDatetime;
      cursorId = id;
    }

    insertStmt.run(
      id,
      uuid,
      mealName,
      mealType,
      cuisineType,
      0.88,
      'benchmark-fixture',
      'Benchmark meal notes',
      'medium',
      i % 2 === 0 ? 1 : 0,
      `file:///data/photos/meal_${i}.jpg`,
      `file:///data/thumbnails/meal_${i}.jpg`,
      locationName,
      35.6812 + (i % 100) * 0.001,
      139.7671 + (i % 100) * 0.001,
      currentDatetime,
      `${mealName} ${cuisineType} ${locationName}`,
      JSON.stringify(['delicious', 'quick']),
      isDeleted,
      createdAt,
      updatedAt
    );
  }

  db.exec('COMMIT;');

  return { baseTime, cursorDatetime, cursorId, duplicateTimestampCount };
}

export function measureQuery(
  db: DatabaseSync,
  sql: string,
  params: (string | number)[],
  iterations = 100,
  warmup = 10
): { stats: MetricStats; queryPlan: QueryPlanDetail[]; returnedRows: number } {
  const explainStmt = db.prepare(`EXPLAIN QUERY PLAN ${sql}`);
  const explainRows = explainStmt.all(...params);
  const queryPlan = explainRows.map(row => {
    const r = row as Record<string, unknown>;
    return {
      id: Number(r.id),
      parent: Number(r.parent),
      notused: Number(r.notused),
      detail: String(r.detail),
    };
  });

  const queryStmt = db.prepare(sql);
  for (let w = 0; w < warmup; w++) {
    queryStmt.all(...params);
  }

  const durationsNs: bigint[] = [];
  let returnedRows = 0;
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    const rows = queryStmt.all(...params);
    const end = process.hrtime.bigint();
    durationsNs.push(end - start);
    if (i === 0) {
      returnedRows = rows.length;
    }
  }

  const durationsMs = durationsNs.map(ns => Number(ns) / 1_000_000).sort((a, b) => a - b);
  const sumMs = durationsMs.reduce((acc, v) => acc + v, 0);
  const avgMs = sumMs / iterations;
  const medianMs = durationsMs[Math.floor(iterations / 2)];
  const p95Ms = durationsMs[Math.floor(iterations * 0.95)];
  const minMs = durationsMs[0];
  const maxMs = durationsMs[durationsMs.length - 1];

  return {
    stats: {
      avgMs: Number(avgMs.toFixed(4)),
      medianMs: Number(medianMs.toFixed(4)),
      p95Ms: Number(p95Ms.toFixed(4)),
      minMs: Number(minMs.toFixed(4)),
      maxMs: Number(maxMs.toFixed(4)),
    },
    queryPlan,
    returnedRows,
  };
}

function parseIndexUsed(planDetails: string[]): string {
  for (const detail of planDetails) {
    const match = detail.match(/USING (?:COVERING )?INDEX (\w+)/);
    if (match) {
      return match[1];
    }
  }
  return 'SCAN TABLE (no index)';
}

/**
 * Validates sequential keyset pagination (Page 1 -> 2 -> 3 -> 4 -> 5)
 * Verifies that duplicate timestamps across page boundaries produce zero duplicates and zero omissions.
 */
export function verifyKeysetPaginationIntegrity(db: DatabaseSync): {
  success: boolean;
  totalCollected: number;
  duplicateCount: number;
  omissionCount: number;
} {
  const pageSize = 20;
  const targetPages = 5;
  const expectedTotal = pageSize * targetPages;

  // Expected top 100 valid rows directly ordered
  const expectedRows = db
    .prepare('SELECT id, meal_datetime FROM meals WHERE is_deleted = 0 ORDER BY meal_datetime DESC, id DESC LIMIT ?')
    .all(expectedTotal) as Array<{ id: string; meal_datetime: number }>;

  const collectedRows: Array<{ id: string; meal_datetime: number }> = [];

  // Page 1
  const page1 = db
    .prepare('SELECT id, meal_datetime FROM meals WHERE is_deleted = 0 ORDER BY meal_datetime DESC, id DESC LIMIT ?')
    .all(pageSize) as Array<{ id: string; meal_datetime: number }>;
  collectedRows.push(...page1);

  // Pages 2..5 using cursor (meal_datetime, id)
  for (let p = 2; p <= targetPages; p++) {
    const lastRow = collectedRows[collectedRows.length - 1];
    if (!lastRow) break;

    const nextPage = db
      .prepare(
        'SELECT id, meal_datetime FROM meals WHERE is_deleted = 0 AND (meal_datetime < ? OR (meal_datetime = ? AND id < ?)) ORDER BY meal_datetime DESC, id DESC LIMIT ?'
      )
      .all(lastRow.meal_datetime, lastRow.meal_datetime, lastRow.id, pageSize) as Array<{
      id: string;
      meal_datetime: number;
    }>;

    collectedRows.push(...nextPage);
  }

  const collectedIds = collectedRows.map(r => r.id);
  const expectedIds = expectedRows.map(r => r.id);

  const idSet = new Set<string>();
  let duplicateCount = 0;
  for (const id of collectedIds) {
    if (idSet.has(id)) {
      duplicateCount++;
    }
    idSet.add(id);
  }

  let omissionCount = 0;
  for (let i = 0; i < expectedIds.length; i++) {
    if (collectedIds[i] !== expectedIds[i]) {
      omissionCount++;
    }
  }

  const success = duplicateCount === 0 && omissionCount === 0 && collectedRows.length === expectedTotal;
  return {
    success,
    totalCollected: collectedRows.length,
    duplicateCount,
    omissionCount,
  };
}

export function runBenchmarkForCount(rowCount: number): BenchmarkRecord[] {
  const db = setupDatabase();
  const { cursorDatetime, cursorId } = seedMealsData(db, rowCount);
  const records: BenchmarkRecord[] = [];

  // ====================================================
  // CONFIG A: Baseline (Version 2 single indexes)
  // ====================================================

  // Case 1: getRecentMeals OFFSET pagination (LIMIT 20 OFFSET 5000)
  {
    const sql =
      'SELECT * FROM meals WHERE is_deleted = 0 ORDER BY meal_datetime DESC, id DESC LIMIT 20 OFFSET 5000';
    const { stats, queryPlan, returnedRows } = measureQuery(db, sql, []);
    const details = queryPlan.map(p => p.detail);
    records.push({
      caseCode: 'Case 1',
      caseTitle: '本番 getRecentMeals OFFSET 5000',
      config: '現行 (Single Indexes)',
      sql,
      rowCount,
      queryPlan: details,
      hasTempBTree: details.some(d => d.includes('USE TEMP B-TREE')),
      hasScanTable: details.some(d => d.includes('SCAN TABLE') || (d.includes('SCAN') && !d.includes('USING INDEX'))),
      indexUsed: parseIndexUsed(details),
      returnedRows,
      stats,
    });
  }

  // Case 1-search: searchMeals representative query (single sort column: meal_datetime DESC)
  {
    const sql = 'SELECT * FROM meals WHERE is_deleted = 0 ORDER BY meal_datetime DESC LIMIT 20 OFFSET 5000';
    const { stats, queryPlan, returnedRows } = measureQuery(db, sql, []);
    const details = queryPlan.map(p => p.detail);
    records.push({
      caseCode: 'Case 1-search',
      caseTitle: '本番 searchMeals 代表クエリ (OFFSET 5000)',
      config: '現行 (Single Indexes)',
      sql,
      rowCount,
      queryPlan: details,
      hasTempBTree: details.some(d => d.includes('USE TEMP B-TREE')),
      hasScanTable: details.some(d => d.includes('SCAN TABLE') || (d.includes('SCAN') && !d.includes('USING INDEX'))),
      indexUsed: parseIndexUsed(details),
      returnedRows,
      stats,
    });
  }

  // Case 2: Production getRecentMeals Keyset with correct tie-breaker:
  // WHERE is_deleted = 0 AND (meal_datetime < ? OR (meal_datetime = ? AND id < ?)) ORDER BY meal_datetime DESC, id DESC LIMIT 20
  {
    const sql =
      'SELECT * FROM meals WHERE is_deleted = 0 AND (meal_datetime < ? OR (meal_datetime = ? AND id < ?)) ORDER BY meal_datetime DESC, id DESC LIMIT 20';
    const { stats, queryPlan, returnedRows } = measureQuery(db, sql, [cursorDatetime, cursorDatetime, cursorId]);
    const details = queryPlan.map(p => p.detail);
    records.push({
      caseCode: 'Case 2',
      caseTitle: '本番 getRecentMeals Keyset 正式条件',
      config: '現行 (Single Indexes)',
      sql,
      rowCount,
      queryPlan: details,
      hasTempBTree: details.some(d => d.includes('USE TEMP B-TREE')),
      hasScanTable: details.some(d => d.includes('SCAN TABLE') || (d.includes('SCAN') && !d.includes('USING INDEX'))),
      indexUsed: parseIndexUsed(details),
      returnedRows,
      stats,
    });
  }

  // Case 2-err: Erroneous Keyset condition (WHERE meal_datetime < ? AND id < ? ORDER BY meal_datetime DESC LIMIT 20)
  {
    const sql =
      'SELECT * FROM meals WHERE meal_datetime < ? AND id < ? ORDER BY meal_datetime DESC LIMIT 20';
    const { stats, queryPlan, returnedRows } = measureQuery(db, sql, [cursorDatetime, cursorId]);
    const details = queryPlan.map(p => p.detail);
    records.push({
      caseCode: 'Case 2-err',
      caseTitle: '誤った Keyset 条件 (AND id < ?)',
      config: '現行 (Single Indexes)',
      sql,
      rowCount,
      queryPlan: details,
      hasTempBTree: details.some(d => d.includes('USE TEMP B-TREE')),
      hasScanTable: details.some(d => d.includes('SCAN TABLE') || (d.includes('SCAN') && !d.includes('USING INDEX'))),
      indexUsed: parseIndexUsed(details),
      returnedRows,
      stats,
    });
  }

  // ====================================================
  // CONFIG B: Composite Index (Issue #81: idx_meals_datetime_deleted)
  // ====================================================
  db.exec(COMPOSITE_INDEX_SQL);

  // Case 3A: Issue #81 Composite Index + getRecentMeals OFFSET 5000
  {
    const sql =
      'SELECT * FROM meals WHERE is_deleted = 0 ORDER BY meal_datetime DESC, id DESC LIMIT 20 OFFSET 5000';
    const { stats, queryPlan, returnedRows } = measureQuery(db, sql, []);
    const details = queryPlan.map(p => p.detail);
    records.push({
      caseCode: 'Case 3A',
      caseTitle: '複合INDEX + getRecentMeals OFFSET 5000',
      config: '複合INDEX (Issue #81)',
      sql,
      rowCount,
      queryPlan: details,
      hasTempBTree: details.some(d => d.includes('USE TEMP B-TREE')),
      hasScanTable: details.some(d => d.includes('SCAN TABLE') || (d.includes('SCAN') && !d.includes('USING INDEX'))),
      indexUsed: parseIndexUsed(details),
      returnedRows,
      stats,
    });
  }

  // Case 3B: Issue #81 Composite Index + getRecentMeals Keyset 正式条件
  {
    const sql =
      'SELECT * FROM meals WHERE is_deleted = 0 AND (meal_datetime < ? OR (meal_datetime = ? AND id < ?)) ORDER BY meal_datetime DESC, id DESC LIMIT 20';
    const { stats, queryPlan, returnedRows } = measureQuery(db, sql, [cursorDatetime, cursorDatetime, cursorId]);
    const details = queryPlan.map(p => p.detail);
    records.push({
      caseCode: 'Case 3B',
      caseTitle: '複合INDEX + getRecentMeals Keyset 正式条件',
      config: '複合INDEX (Issue #81)',
      sql,
      rowCount,
      queryPlan: details,
      hasTempBTree: details.some(d => d.includes('USE TEMP B-TREE')),
      hasScanTable: details.some(d => d.includes('SCAN TABLE') || (d.includes('SCAN') && !d.includes('USING INDEX'))),
      indexUsed: parseIndexUsed(details),
      returnedRows,
      stats,
    });
  }

  // Case 3-search: Issue #81 Composite Index + searchMeals 代表クエリ (OFFSET 5000)
  {
    const sql = 'SELECT * FROM meals WHERE is_deleted = 0 ORDER BY meal_datetime DESC LIMIT 20 OFFSET 5000';
    const { stats, queryPlan, returnedRows } = measureQuery(db, sql, []);
    const details = queryPlan.map(p => p.detail);
    records.push({
      caseCode: 'Case 3-search',
      caseTitle: '複合INDEX + searchMeals 代表クエリ (OFFSET 5000)',
      config: '複合INDEX (Issue #81)',
      sql,
      rowCount,
      queryPlan: details,
      hasTempBTree: details.some(d => d.includes('USE TEMP B-TREE')),
      hasScanTable: details.some(d => d.includes('SCAN TABLE') || (d.includes('SCAN') && !d.includes('USING INDEX'))),
      indexUsed: parseIndexUsed(details),
      returnedRows,
      stats,
    });
  }

  db.close();
  return records;
}

export function runOffsetDepthBenchmark(rowCount = 20000): OffsetDepthRecord[] {
  const db = setupDatabase();
  const { baseTime } = seedMealsData(db, rowCount);
  const offsets = [0, 20, 100, 1000, 5000, 10000];
  const depthRecords: OffsetDepthRecord[] = [];

  for (const offset of offsets) {
    const sqlOffset =
      'SELECT * FROM meals WHERE is_deleted = 0 ORDER BY meal_datetime DESC, id DESC LIMIT 20 OFFSET ?';
    const resA = measureQuery(db, sqlOffset, [offset], 100, 10);

    db.exec(COMPOSITE_INDEX_SQL);
    const resB_Offset = measureQuery(db, sqlOffset, [offset], 100, 10);

    const targetDt = baseTime - offset * (4 * 3600 * 1000);
    const targetId = `meal-${String(offset).padStart(7, '0')}`;
    const sqlKeyset =
      'SELECT * FROM meals WHERE is_deleted = 0 AND (meal_datetime < ? OR (meal_datetime = ? AND id < ?)) ORDER BY meal_datetime DESC, id DESC LIMIT 20';
    const resB_Keyset = measureQuery(db, sqlKeyset, [targetDt, targetDt, targetId], 100, 10);

    db.exec('DROP INDEX IF EXISTS idx_meals_datetime_deleted;');

    depthRecords.push({
      offset,
      configA_BaselineMs: resA.stats.avgMs,
      configB_CompositeOffsetMs: resB_Offset.stats.avgMs,
      configB_CompositeKeysetMs: resB_Keyset.stats.avgMs,
    });
  }

  db.close();
  return depthRecords;
}

export function runBenchmarkSuite(): {
  records: BenchmarkRecord[];
  depthRecords: OffsetDepthRecord[];
  integritySuccess: boolean;
} {
  console.log('========================================================================================');
  console.log('Meals Query Pagination & Composite Index Benchmark (Issue #80 & #81)');
  console.log('Environment: Node.js node:sqlite (Mac in-memory) | 100 runs per query | 10 warmup runs');
  console.log('========================================================================================\n');

  // 1. Verify Keyset Sequential Pagination Integrity (Page 1 -> 5)
  console.log('▶ Verifying Keyset continuous pagination integrity (Page 1 -> 5)...');
  const verifyDb = setupDatabase();
  seedMealsData(verifyDb, 200); // 200 records with duplicate timestamps
  const integrity = verifyKeysetPaginationIntegrity(verifyDb);
  verifyDb.close();

  if (integrity.success) {
    console.log(
      `  ✓ Integrity PASS: ${integrity.totalCollected} rows collected across 5 pages, 0 duplicates, 0 omissions (identical timestamps handled properly).\n`
    );
  } else {
    console.error(
      `  ✗ Integrity FAIL: collected=${integrity.totalCollected}, duplicates=${integrity.duplicateCount}, omissions=${integrity.omissionCount}\n`
    );
  }

  // 2. Main Benchmarks across dataset sizes
  const counts = [1000, 5000, 10000, 20000];
  const allRecords: BenchmarkRecord[] = [];

  for (const count of counts) {
    console.log(`▶ Dataset size: ${count.toLocaleString()} rows`);
    const records = runBenchmarkForCount(count);
    allRecords.push(...records);

    for (const r of records) {
      const btree = r.hasTempBTree ? 'YES (TEMP B-TREE)' : 'NO  (Zero Sort)';
      console.log(
        `  ${r.caseCode.padEnd(14)} | ${r.caseTitle.padEnd(46)} | avg: ${r.stats.avgMs.toFixed(3).padStart(6)} ms | med: ${r.stats.medianMs.toFixed(3).padStart(6)} ms | p95: ${r.stats.p95Ms.toFixed(3).padStart(6)} ms | sort: ${btree} | idx: ${r.indexUsed.padEnd(25)} | rows: ${r.returnedRows}`
      );
    }
    console.log('');
  }

  // 3. OFFSET Depth Scaling Benchmark
  console.log('----------------------------------------------------------------------------------------');
  console.log('OFFSET Depth Scaling Benchmark (20,000 rows, in-memory reference)');
  console.log('----------------------------------------------------------------------------------------');
  const depthRecords = runOffsetDepthBenchmark(20000);
  console.log('OFFSET | Baseline (Single INDEX) | Composite (OFFSET) | Composite (Keyset)');
  console.log('-------|-------------------------|--------------------|-------------------');
  for (const d of depthRecords) {
    console.log(
      `${String(d.offset).padStart(6)} | ${d.configA_BaselineMs.toFixed(3).padStart(21)} ms | ${d.configB_CompositeOffsetMs.toFixed(3).padStart(16)} ms | ${d.configB_CompositeKeysetMs.toFixed(3).padStart(15)} ms`
    );
  }

  return { records: allRecords, depthRecords, integritySuccess: integrity.success };
}

if (process.argv[1]?.endsWith('benchmark-meals-query.ts')) {
  runBenchmarkSuite();
}
