// Re-runs the automated document checks on existing submissions and prints
// every check before and after. Uses the database configured in .env.
//
//   node scripts/reverify-documents.js --project ALU-2026-3K3RQ
//   node scripts/reverify-documents.js --document 42
//   node scripts/reverify-documents.js --all            (every degree and RDB certificate)
//
// The administrator still makes every decision; this only refreshes the flag.
const { Op } = require('sequelize');
const { sequelize, Document, Project } = require('../src/models');
const { verifyDocumentNow, VERIFIABLE } = require('../src/workers/jobs');
const { shutdown } = require('../src/services/verification/textExtraction');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] || true : null;
}

const mark = (c) => (!c ? '—' : c.neutral ? 'NOTE' : c.passed ? 'PASS' : 'FAIL');

function printComparison(before, after) {
  const ids = [...new Set([...(before.checks || []), ...(after.checks || [])].map((c) => c.id))];
  for (const id of ids) {
    const b = (before.checks || []).find((c) => c.id === id);
    const a = (after.checks || []).find((c) => c.id === id);
    console.log(`  ${(a || b).label}`);
    console.log(`    before: ${mark(b).padEnd(4)}  ${b?.detail || ''}`);
    console.log(`    after:  ${mark(a).padEnd(4)}  ${a?.detail || ''}`);
  }
  console.log(`  Flag:   ${before.flag || 'none'} → ${after.flag}   (read via ${before.method || 'n/a'} → ${after.method})`);
}

async function main() {
  const where = { kind: { [Op.in]: [...VERIFIABLE] } };
  if (arg('document')) where.id = Number(arg('document'));
  else if (arg('project')) {
    const project = await Project.findOne({ where: { projectCode: String(arg('project')).toUpperCase() } });
    if (!project) throw new Error(`No project with code ${arg('project')}.`);
    where.projectId = project.id;
  } else if (!arg('all')) {
    throw new Error('Pass --project <code>, --document <id> or --all.');
  }

  console.log(`Database: ${sequelize.config.database}`);
  const documents = await Document.findAll({ where, order: [['id', 'ASC']] });
  if (!documents.length) console.log('No degree or RDB certificates matched.');
  for (const document of documents) {
    const before = { ...(document.extractionJson || {}), flag: document.flag };
    await verifyDocumentNow(document.id, { rerun: true });
    await document.reload();
    console.log(`\nDocument ${document.id} · ${document.kind} · ${document.originalName}`);
    printComparison(before, { ...document.extractionJson, flag: document.flag });
  }
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await shutdown();
    await sequelize.close();
  });
