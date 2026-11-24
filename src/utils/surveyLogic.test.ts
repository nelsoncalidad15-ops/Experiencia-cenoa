import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BRANCHES,
  IMPROVE_TAGS,
  POSITIVE_TAGS,
  computeBranchStats,
  filterSurveys,
  formatCsv,
  formatTsvForSheets,
  getRatingLabel,
  getTagsForRating,
  slugifyBranchId,
  validateSurveyVoteInput,
} from './surveyLogic.ts';
import type { SurveyEntry } from '../types/survey.ts';

const SAMPLE_SURVEYS: SurveyEntry[] = [
  {
    id: 's1',
    branchId: 'autosol-jujuy',
    branchName: 'Autosol Jujuy',
    rating: 5,
    area: 'Ventas',
    tags: ['Amabilidad', 'Rapidez'],
    comment: 'Excelente atención del asesor.',
    createdAt: '2026-11-24T10:15:00.000Z',
  },
  {
    id: 's2',
    branchId: 'autosol-jujuy',
    branchName: 'Autosol Jujuy',
    rating: 4,
    area: 'Postventa / Taller',
    comment: '',
    createdAt: '2026-11-24T11:30:00.000Z',
  },
  {
    id: 's3',
    branchId: 'autolux-salta',
    branchName: 'Autolux Salta',
    rating: 2,
    area: 'Repuestos',
    comment: 'Demora en entrega, "muy lento".',
    createdAt: '2026-11-24T12:00:00.000Z',
  },
];

test('default branches include the five requested dealerships', () => {
  const names = DEFAULT_BRANCHES.map((b) => b.name);
  assert.deepEqual(names, [
    'Autosol Jujuy',
    'Autosol Salta',
    'Autolux Jujuy',
    'Autolux Salta',
    'Autociel',
  ]);
});

test('computeBranchStats filters accurately per branch and computes average & satisfaction', () => {
  const jujuyStats = computeBranchStats(SAMPLE_SURVEYS, 'autosol-jujuy');
  assert.equal(jujuyStats.total, 2);
  assert.equal(jujuyStats.average, 4.5);
  assert.equal(jujuyStats.satisfactionRate, 100);
  assert.equal(jujuyStats.distribution[5], 1);
  assert.equal(jujuyStats.distribution[4], 1);
  assert.equal(jujuyStats.lastCreatedAt, '2026-11-24T11:30:00.000Z');

  const allStats = computeBranchStats(SAMPLE_SURVEYS, 'all');
  assert.equal(allStats.total, 3);
  assert.equal(allStats.average, 3.7);
  assert.equal(allStats.satisfactionRate, 67);

  const emptyStats = computeBranchStats(SAMPLE_SURVEYS, 'autociel');
  assert.equal(emptyStats.total, 0);
  assert.equal(emptyStats.average, 0);
  assert.equal(emptyStats.lastCreatedAt, null);
});

test('filterSurveys filters by branchId, ratingFilter, and searchQuery', () => {
  const byBranch = filterSurveys(SAMPLE_SURVEYS, {
    branchId: 'autolux-salta',
    ratingFilter: 'all',
    searchQuery: '',
  });
  assert.equal(byBranch.length, 1);
  assert.equal(byBranch[0].id, 's3');

  const bySearch = filterSurveys(SAMPLE_SURVEYS, {
    branchId: 'all',
    ratingFilter: 'all',
    searchQuery: 'asesor',
  });
  assert.equal(bySearch.length, 1);
  assert.equal(bySearch[0].id, 's1');

  const byRating = filterSurveys(SAMPLE_SURVEYS, {
    branchId: 'autosol-jujuy',
    ratingFilter: 5,
    searchQuery: '',
  });
  assert.equal(byRating.length, 1);
  assert.equal(byRating[0].id, 's1');

  const byTag = filterSurveys(SAMPLE_SURVEYS, {
    branchId: 'all',
    ratingFilter: 'all',
    searchQuery: 'rapidez',
  });
  assert.equal(byTag.length, 1);
  assert.equal(byTag[0].id, 's1');
});

test('formatCsv escapes quotes and commas with UTF-8 BOM and includes Motivos for Google Sheets / Excel', () => {
  const csv = formatCsv(SAMPLE_SURVEYS);
  assert.ok(csv.startsWith('\uFEFFID,Fecha y Hora,Sucursal,Estrellas,Calificación,Área,Motivos,Comentario'));
  assert.ok(csv.includes('"Amabilidad, Rapidez"'));
  assert.ok(csv.includes('"Demora en entrega, ""muy lento""."'));
});

test('formatTsvForSheets creates clean tab-separated rows with Motivos', () => {
  const tsv = formatTsvForSheets(SAMPLE_SURVEYS);
  const lines = tsv.split('\n');
  assert.equal(lines.length, 4);
  assert.ok(lines[0].includes('\tMotivos\tComentario'));
  assert.ok(lines[1].includes('\tAutosol Jujuy\t5\tExcelente\tVentas\tAmabilidad, Rapidez\t'));
});

test('getTagsForRating returns positive tags for 4-5 and improvement tags for 1-3', () => {
  assert.deepEqual(getTagsForRating(5), POSITIVE_TAGS);
  assert.deepEqual(getTagsForRating(4), POSITIVE_TAGS);
  assert.deepEqual(getTagsForRating(3), IMPROVE_TAGS);
  assert.deepEqual(getTagsForRating(1), IMPROVE_TAGS);
});

test('validateSurveyVoteInput validates rating range and branchId', () => {
  assert.equal(validateSurveyVoteInput({ branchId: '', rating: 5 }).ok, false);
  assert.equal(validateSurveyVoteInput({ branchId: 'autociel', rating: 6 }).ok, false);
  assert.equal(validateSurveyVoteInput({ branchId: 'autociel', rating: 0 }).ok, false);
  assert.deepEqual(validateSurveyVoteInput({ branchId: 'autociel', rating: 5 }), {
    ok: true,
    branchId: 'autociel',
    rating: 5,
  });
});

test('slugifyBranchId and getRatingLabel behave deterministically', () => {
  assert.equal(slugifyBranchId('Autosol Tartagal Norte'), 'autosol-tartagal-norte');
  assert.equal(getRatingLabel(5), 'Excelente');
  assert.equal(getRatingLabel(1), 'Muy insatisfecho');
});
