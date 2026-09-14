import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { inferVirtualDentition } from '../lib/virtual-dentition';
import { jawCaseGeometry } from '../lib/jaw-cases';
import {
  planningAnatomyFromGeometry,
  caseCapabilities,
} from '../lib/case-planning';
import { initialImplant, implantPose } from '../lib/planning';
import { chartFromAnatomy } from '../lib/perio-display';
import {
  buildAutoImplantPlan,
  AUTO_PLAN_LIMITS,
  AUTO_PLAN_VERSION,
} from '../lib/auto-implant-plan';
import { capsuleGap } from '../lib/planning-surface';
const referenceBytes = readFileSync('public/anatomy/toothfairy.bin');
const reference = {
  parts: JSON.parse(readFileSync('public/anatomy/manifest.json', 'utf8')).parts,
  buffer: referenceBytes.buffer.slice(
    referenceBytes.byteOffset,
    referenceBytes.byteOffset + referenceBytes.byteLength,
  ),
};
const cases = [];
for (const file of readdirSync('public/cases/toothfairy')
  .filter((f) => /^tf[23]-.+\.json$/.test(f))
  .sort()) {
  const record = JSON.parse(
    readFileSync(`public/cases/toothfairy/${file}`, 'utf8'),
  );
  const bytes = readFileSync(
    `public/cases/toothfairy/${file.replace('.json', '.bin')}`,
  );
  const data = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  const geometry = jawCaseGeometry(record, data),
    model = planningAnatomyFromGeometry(geometry)!;
  assert.ok(model, file);
  const display = inferVirtualDentition(model, reference);
  const capability = caseCapabilities(display.parts);
  const requested = [16, 26, 36, 46].filter(
    (n) => capability.sites[n]?.enabled,
  );
  if (!requested.length)
    requested.push(
      ...Object.entries(capability.sites)
        .filter(([, v]) => v.enabled)
        .slice(0, 2)
        .map(([n]) => Number(n)),
    );
  const sourceHash = createHash('sha256')
    .update(new Uint8Array(model.buffer))
    .digest('hex');
  const start = performance.now();
  const result = buildAutoImplantPlan({
    parts: display.parts,
    buffer: display.buffer,
    chart: chartFromAnatomy(display.parts),
    implants: requested.map((tooth, i) => ({
      ...initialImplant,
      id: `IP-${String(i + 1).padStart(2, '0')}`,
      tooth,
    })),
    needs: {},
    anatomyId: record.id,
  });
  assert.equal(
    createHash('sha256').update(new Uint8Array(model.buffer)).digest('hex'),
    sourceHash,
  );
  for (const s of result.sites.filter((s) => s.status === 'proposed')) {
    assert.ok(s.criticalClearance! >= AUTO_PLAN_LIMITS.critical);
    assert.ok(
      s.toothClearance === undefined ||
        s.toothClearance >= AUTO_PLAN_LIMITS.tooth,
    );
    assert.ok(s.boneCoverage! >= AUTO_PLAN_LIMITS.boneCoverage);
    assert.ok(
      Object.values(s.plan!)
        .filter((v) => typeof v === 'number')
        .every(Number.isFinite),
    );
  }
  for (let a = 0; a < result.implants.length; a++)
    for (let b = a + 1; b < result.implants.length; b++)
      assert.ok(
        capsuleGap(
          {
            ...implantPose(result.implants[a], display.parts),
            ...result.implants[a],
          },
          {
            ...implantPose(result.implants[b], display.parts),
            ...result.implants[b],
          },
        ) >= AUTO_PLAN_LIMITS.implant,
      );
  cases.push({
    id: record.id,
    sourceSha256: record.sha256,
    inferredSites: display.parts
      .filter((p) => p.inferred)
      .map((p) => ({ tooth: p.fdi, ...p.inferred })),
    proposedSizes: result.sites
      .filter((s) => s.plan)
      .map((s) => ({
        tooth: s.tooth,
        diameter: s.plan!.diameter,
        sizing: s.sizing,
      })),
    requestedSites: requested,
    proposedSites: result.implants.map((p) => p.tooth),
    deferred: result.sites
      .filter((s) => s.status === 'deferred')
      .map((s) => ({ tooth: s.tooth, reason: s.reason })),
    evaluated: result.evaluated,
    durationMs: Math.round(performance.now() - start),
    sourceUnchanged: true,
  });
  console.log(
    record.id,
    requested.length,
    result.implants.length,
    cases.at(-1)!.durationMs,
  );
  geometry.dispose();
}
mkdirSync('public/analysis', { recursive: true });
writeFileSync(
  'public/analysis/auto-implant-geometry-validation.json',
  JSON.stringify(
    {
      algorithm: AUTO_PLAN_VERSION,
      date: new Date().toISOString(),
      type: 'geometry-regression',
      trainedModel: false,
      clinicianGroundTruth: false,
      syntheticSiteRequests: true,
      limits: AUTO_PLAN_LIMITS,
      caseCount: cases.length,
      cases,
    },
    null,
    2,
  ) + '\n',
);
