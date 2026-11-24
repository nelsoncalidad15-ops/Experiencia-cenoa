/**
 * ============================================================
 *  EXPERIENCIA CENOA · Backend de encuestas en Google Sheets
 * ============================================================
 *
 *  INSTALACIÓN (una sola vez):
 *  1. Creá un Google Sheet nuevo (ej: "Encuestas Experiencia CENOA").
 *  2. Menú Extensiones → Apps Script. Borrá todo y pegá este archivo.
 *  3. Guardá (💾) y ejecutá la función `setup` una vez (botón ▶ Ejecutar).
 *     Aceptá los permisos. Se crean las hojas "Encuestas" y "Sucursales".
 *  4. Implementar → Nueva implementación → Tipo: "Aplicación web".
 *       - Ejecutar como: Yo
 *       - Quién tiene acceso: Cualquier persona
 *     Copiá la URL que termina en /exec.
 *  5. Pegá esa URL en:
 *       - Cloudflare Pages → Settings → Environment variables →
 *         VITE_APPS_SCRIPT_URL  (y volvé a desplegar), o
 *       - En la app: Configuración → "Conexión con Google Sheets".
 *
 *  Si modificás este código: Implementar → Gestionar implementaciones →
 *  ✏️ Editar → Versión: "Nueva versión" → Implementar (la URL no cambia).
 */

// Opcional: si creás el script de forma independiente (no desde Extensiones → Apps Script),
// pegá aquí el ID de tu Google Sheet (lo sacás de la URL: /spreadsheets/d/<ID>/edit).
const SPREADSHEET_ID = '';

const SHEET_SURVEYS = 'Encuestas';
const SHEET_BRANCHES = 'Sucursales';
const SHEET_SUMMARY = 'Resumen';
const TIMEZONE = 'America/Argentina/Jujuy';

const SURVEY_HEADERS = [
  'ID', 'Fecha', 'Hora', 'Sucursal ID', 'Sucursal', 'Estrellas',
  'Calificación', 'Sector', 'Motivos', 'Comentario', 'Fecha ISO',
];
const BRANCH_HEADERS = [
  'ID', 'Nombre', 'Grupo', 'Ciudad', 'Pregunta', 'Título gracias', 'Mensaje gracias',
];
const SUMMARY_HEADERS = [
  'Sucursal', 'Total', 'Promedio ★', 'Satisfacción (4-5★)', '5★', '4★', '3★', '2★', '1★',
];

const RATING_LABELS = {
  1: 'Muy insatisfecho', 2: 'Insatisfecho', 3: 'Regular', 4: 'Muy buena', 5: 'Excelente',
};
const VALID_AREAS = ['Ventas', 'Postventa / Taller', 'Repuestos', 'Administración', 'General'];
const VALID_GROUPS = ['Autosol', 'Autolux', 'Autociel', 'Otro'];

const DEFAULT_QUESTION = '¿Cómo fue tu experiencia hoy en tu visita?';
const DEFAULT_TY_TITLE = '¡Muchas gracias por tu opinión!';
const DEFAULT_TY_SUB = 'Tu calificación nos ayuda a seguir brindando una atención de excelencia.';

const SEED_BRANCHES = [
  ['autosol-jujuy', 'Autosol Jujuy', 'Autosol', 'San Salvador de Jujuy'],
  ['autosol-salta', 'Autosol Salta', 'Autosol', 'Salta Capital'],
  ['autolux-jujuy', 'Autolux Jujuy', 'Autolux', 'San Salvador de Jujuy'],
  ['autolux-salta', 'Autolux Salta', 'Autolux', 'Salta Capital'],
  ['autociel', 'Autociel', 'Autociel', 'Casa Central'],
];

// ------------------------------------------------------------
//  Endpoints
// ------------------------------------------------------------

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'getAll';
    if (action === 'getAll') {
      return json_({
        ok: true,
        branches: readBranches_(),
        surveys: readSurveys_(),
        sheetUrl: getSpreadsheet_().getUrl(),
      });
    }
    if (action === 'ping') return json_({ ok: true, ts: new Date().toISOString() });
    return json_({ ok: false, error: 'Acción desconocida: ' + action });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = body.action;
    const p = body.payload || {};

    switch (action) {
      case 'saveSurvey':   return json_({ ok: true, survey: saveSurvey_(p) });
      case 'deleteSurvey': return json_({ ok: true, deleted: deleteSurvey_(p.id) });
      case 'saveBranch':   return json_({ ok: true, branch: saveBranch_(p) });
      default:             return json_({ ok: false, error: 'Acción desconocida: ' + action });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

// ------------------------------------------------------------
//  Encuestas
// ------------------------------------------------------------

function saveSurvey_(p) {
  const id = clean_(p.id, 40);
  if (!id) throw new Error('ID de encuesta requerido');
  const rating = Number(p.rating);
  if (!(rating >= 1 && rating <= 5 && Math.floor(rating) === rating)) {
    throw new Error('La calificación debe estar entre 1 y 5');
  }
  const branchId = clean_(p.branchId, 60);
  if (!branchId) throw new Error('Sucursal requerida');

  const created = p.createdAt ? new Date(p.createdAt) : new Date();
  const date = isNaN(created.getTime()) ? new Date() : created;
  const area = VALID_AREAS.indexOf(p.area) >= 0 ? p.area : 'Ventas';
  const tags = Array.isArray(p.tags) ? p.tags.map(function (t) { return clean_(t, 40); }).filter(String) : [];

  const row = [
    id,
    date, // fecha real (formateada dd/mm/yyyy en la hoja)
    "'" + Utilities.formatDate(date, TIMEZONE, 'HH:mm'),
    branchId,
    clean_(p.branchName, 60) || branchId,
    rating,
    RATING_LABELS[rating],
    area,
    tags.join(', '),
    clean_(p.comment, 280),
    "'" + date.toISOString(),
  ];

  const sh = sheet_(SHEET_SURVEYS, SURVEY_HEADERS);
  let rowIndex = findRow_(sh, id);
  if (rowIndex > 0) {
    sh.getRange(rowIndex, 1, 1, row.length).setValues([row]);
  } else {
    sh.appendRow(row);
    rowIndex = sh.getLastRow();
  }
  sh.getRange(rowIndex, 2).setNumberFormat('dd/mm/yyyy');
  return rowToSurvey_([id, date, '', branchId, row[4], rating, '', area, row[8], row[9], date.toISOString()]);
}

function deleteSurvey_(id) {
  const sh = sheet_(SHEET_SURVEYS, SURVEY_HEADERS);
  const rowIndex = findRow_(sh, clean_(id, 40));
  if (rowIndex > 0) {
    sh.deleteRow(rowIndex);
    return true;
  }
  return false; // ya no existía: lo tratamos como éxito para no trabar la cola
}

function readSurveys_() {
  const sh = sheet_(SHEET_SURVEYS, SURVEY_HEADERS);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const values = sh.getRange(2, 1, last - 1, SURVEY_HEADERS.length).getValues();
  return values
    .filter(function (r) { return r[0]; })
    .map(rowToSurvey_)
    .sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
}

function rowToSurvey_(r) {
  return {
    id: String(r[0]),
    branchId: String(r[3]),
    branchName: String(r[4]),
    rating: Number(r[5]),
    area: String(r[7] || 'General'),
    tags: r[8] ? String(r[8]).split(',').map(function (t) { return t.trim(); }).filter(String) : [],
    comment: String(r[9] || ''),
    createdAt: (r[10] instanceof Date
      ? r[10].toISOString()
      : String(r[10] || (r[1] instanceof Date ? r[1].toISOString() : ''))
    ).replace(/^'/, ''),
  };
}

// ------------------------------------------------------------
//  Sucursales
// ------------------------------------------------------------

function saveBranch_(p) {
  const id = clean_(p.id, 60);
  const name = clean_(p.name, 60);
  if (!id || !name) throw new Error('Sucursal inválida');
  const row = [
    id,
    name,
    VALID_GROUPS.indexOf(p.group) >= 0 ? p.group : 'Otro',
    clean_(p.city, 60) || 'Sucursal',
    clean_(p.question, 160) || DEFAULT_QUESTION,
    clean_(p.thankYouTitle, 100) || DEFAULT_TY_TITLE,
    clean_(p.thankYouSubtitle, 200) || DEFAULT_TY_SUB,
  ];
  const sh = sheet_(SHEET_BRANCHES, BRANCH_HEADERS);
  const rowIndex = findRow_(sh, id);
  if (rowIndex > 0) sh.getRange(rowIndex, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
  return rowToBranch_(row);
}

function readBranches_() {
  const sh = sheet_(SHEET_BRANCHES, BRANCH_HEADERS);
  if (sh.getLastRow() < 2) seedBranches_(sh);
  const values = sh.getRange(2, 1, sh.getLastRow() - 1, BRANCH_HEADERS.length).getValues();
  return values.filter(function (r) { return r[0]; }).map(rowToBranch_);
}

function rowToBranch_(r) {
  return {
    id: String(r[0]),
    name: String(r[1]),
    group: String(r[2] || 'Otro'),
    city: String(r[3] || ''),
    question: String(r[4] || DEFAULT_QUESTION),
    thankYouTitle: String(r[5] || DEFAULT_TY_TITLE),
    thankYouSubtitle: String(r[6] || DEFAULT_TY_SUB),
  };
}

function seedBranches_(sh) {
  const rows = SEED_BRANCHES.map(function (b) {
    return [b[0], b[1], b[2], b[3], DEFAULT_QUESTION, DEFAULT_TY_TITLE, DEFAULT_TY_SUB];
  });
  sh.getRange(2, 1, rows.length, BRANCH_HEADERS.length).setValues(rows);
}

// ------------------------------------------------------------
//  Utilidades
// ------------------------------------------------------------

function getSpreadsheet_() {
  var ss = SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActive();
  if (!ss) {
    throw new Error(
      'No se encontró la planilla activa. Configurá SPREADSHEET_ID en Code.gs o abrí el script desde la planilla (Extensiones → Apps Script).'
    );
  }
  return ss;
}

function sheet_(name, headers) {
  const ss = getSpreadsheet_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    formatSheet_(sh, headers);
  }
  return sh;
}

function formatSheet_(sh, headers) {
  sh.getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setFontWeight('bold')
    .setFontColor('#ffffff')
    .setBackground('#0f172a')
    .setVerticalAlignment('middle');
  sh.setFrozenRows(1);
  sh.setRowHeight(1, 32);
}

function findRow_(sh, id) {
  if (!id || sh.getLastRow() < 2) return -1;
  const found = sh.getRange(2, 1, sh.getLastRow() - 1, 1)
    .createTextFinder(id).matchEntireCell(true).findNext();
  return found ? found.getRow() : -1;
}

function clean_(value, max) {
  if (value === null || value === undefined) return '';
  let s = String(value).replace(/[\r\n\t]+/g, ' ').trim();
  // Evita inyección de fórmulas en Sheets.
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s.slice(0, max || 200);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------------
//  Configuración inicial (ejecutar una vez desde el editor)
// ------------------------------------------------------------

function setup() {
  const ss = getSpreadsheet_();
  ss.setSpreadsheetTimeZone(TIMEZONE);

  const surveys = sheet_(SHEET_SURVEYS, SURVEY_HEADERS);
  formatSheet_(surveys, SURVEY_HEADERS);
  surveys.setColumnWidths(1, SURVEY_HEADERS.length, 120);
  surveys.setColumnWidth(9, 220);
  surveys.setColumnWidth(10, 360);
  surveys.hideColumns(11); // Fecha ISO (uso interno)

  // Colores por estrellas (columna F)
  const range = surveys.getRange('F2:F');
  const rules = [
    SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThanOrEqualTo(4)
      .setBackground('#dcfce7').setFontColor('#166534').setRanges([range]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberEqualTo(3)
      .setBackground('#fef9c3').setFontColor('#854d0e').setRanges([range]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberLessThanOrEqualTo(2)
      .setBackground('#fee2e2').setFontColor('#991b1b').setRanges([range]).build(),
  ];
  surveys.setConditionalFormatRules(rules);

  const branches = sheet_(SHEET_BRANCHES, BRANCH_HEADERS);
  formatSheet_(branches, BRANCH_HEADERS);
  if (branches.getLastRow() < 2) seedBranches_(branches);
  branches.setColumnWidths(1, BRANCH_HEADERS.length, 160);
  branches.setColumnWidth(5, 320);

  // Pestaña de resumen automático con fórmulas en inglés (Sheets las traduce al mostrar)
  const summary = sheet_(SHEET_SUMMARY, SUMMARY_HEADERS);
  formatSheet_(summary, SUMMARY_HEADERS);
  summary.setColumnWidth(1, 220);
  summary.setColumnWidths(2, SUMMARY_HEADERS.length - 1, 120);
  summary.setColumnWidth(4, 150);

  const summaryRows = [
    [
      'TOTAL GENERAL',
      '=COUNTA(Encuestas!A2:A)',
      '=IFERROR(AVERAGE(Encuestas!F2:F),0)',
      '=IFERROR(COUNTIF(Encuestas!F2:F,">=4")/B2,0)',
      '=COUNTIF(Encuestas!F2:F,5)',
      '=COUNTIF(Encuestas!F2:F,4)',
      '=COUNTIF(Encuestas!F2:F,3)',
      '=COUNTIF(Encuestas!F2:F,2)',
      '=COUNTIF(Encuestas!F2:F,1)',
    ],
  ];

  for (var i = 0; i < 20; i++) {
    var bRow = 2 + i;
    var sRow = 3 + i;
    summaryRows.push([
      '=IF(Sucursales!B' + bRow + '="","",Sucursales!B' + bRow + ')',
      '=IF(Sucursales!A' + bRow + '="","",COUNTIF(Encuestas!$D$2:$D,Sucursales!A' + bRow + '))',
      '=IF(Sucursales!A' + bRow + '="","",IFERROR(AVERAGEIF(Encuestas!$D$2:$D,Sucursales!A' + bRow + ',Encuestas!$F$2:$F),0))',
      '=IF(Sucursales!A' + bRow + '="","",IFERROR(COUNTIFS(Encuestas!$D$2:$D,Sucursales!A' + bRow + ',Encuestas!$F$2:$F,">=4")/B' + sRow + ',0))',
      '=IF(Sucursales!A' + bRow + '="","",COUNTIFS(Encuestas!$D$2:$D,Sucursales!A' + bRow + ',Encuestas!$F$2:$F,5))',
      '=IF(Sucursales!A' + bRow + '="","",COUNTIFS(Encuestas!$D$2:$D,Sucursales!A' + bRow + ',Encuestas!$F$2:$F,4))',
      '=IF(Sucursales!A' + bRow + '="","",COUNTIFS(Encuestas!$D$2:$D,Sucursales!A' + bRow + ',Encuestas!$F$2:$F,3))',
      '=IF(Sucursales!A' + bRow + '="","",COUNTIFS(Encuestas!$D$2:$D,Sucursales!A' + bRow + ',Encuestas!$F$2:$F,2))',
      '=IF(Sucursales!A' + bRow + '="","",COUNTIFS(Encuestas!$D$2:$D,Sucursales!A' + bRow + ',Encuestas!$F$2:$F,1))',
    ]);
  }

  summary.getRange(2, 1, summaryRows.length, SUMMARY_HEADERS.length).setValues(summaryRows);
  summary.getRange(2, 1, 1, SUMMARY_HEADERS.length).setFontWeight('bold').setBackground('#f1f5f9');
  summary.getRange(2, 2, summaryRows.length, 1).setNumberFormat('#,##0');
  summary.getRange(2, 3, summaryRows.length, 1).setNumberFormat('0.00');
  summary.getRange(2, 4, summaryRows.length, 1).setNumberFormat('0.0%');
  summary.getRange(2, 5, summaryRows.length, 5).setNumberFormat('#,##0');

  // Quita la "Hoja 1" vacía si existe
  const blank = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (blank && ss.getSheets().length > 2 && blank.getLastRow() === 0) ss.deleteSheet(blank);

  Logger.log('Listo ✅  Ahora: Implementar → Nueva implementación → Aplicación web.');
}
