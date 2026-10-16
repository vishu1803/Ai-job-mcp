import fs from 'node:fs/promises';
import path from 'node:path';
import { ResumeContentBudgetService } from '../src/services/resume-content-budget.service.js';

async function generateReports() {
  const baseDir = path.resolve('output/unified-resume/comparative-acceptance');
  const geometryReport = JSON.parse(
    await fs.readFile(path.join(baseDir, 'geometry-measurement-report.json'), 'utf8')
  );

  const fullReport = {};

  for (const role of ['software-engineer', 'senior-backend-engineer']) {
    const structuredPath = path.join(baseDir, `${role}.structured.json`);
    const structured = JSON.parse(await fs.readFile(structuredPath, 'utf8'));
    const geom = geometryReport[role] || {};

    const report = ResumeContentBudgetService.generateSectionBudgetReport({
      structuredResume: structured,
      pageMeasurements: {
        pageCount: geom.pageCount || 1,
        minimumFontPt: geom.typography?.minimumFontPt || 10.0,
        topMarginMm: geom.margins?.topMarginMm || 11.6,
        bottomMarginMm: geom.margins?.bottomMarginMm || 18.1,
        bottomOccupancyRatio: geom.margins?.verticalOccupancyRatio || 0.9,
      },
    });

    fullReport[role] = {
      ...report,
      geometryMeasurements: geom,
      provenanceVerification: {
        writingMethod: structured.writing?.method,
        provider: structured.writing?.provider,
        summaryStatus: structured.writing?.summaryStatus,
        modelId: structured.writing?.modelId,
      },
    };

    const outPath = path.join(baseDir, `${role}.budget-report.json`);
    await fs.writeFile(outPath, JSON.stringify(fullReport[role], null, 2));
    console.log(`Saved budget report for ${role} to ${outPath}`);
  }

  const combinedPath = path.join(baseDir, 'comparative-budget-report.json');
  await fs.writeFile(combinedPath, JSON.stringify(fullReport, null, 2));
  console.log(`Saved combined budget report to ${combinedPath}`);
}

generateReports().catch((err) => {
  console.error('Error generating budget reports:', err);
  process.exit(1);
});
