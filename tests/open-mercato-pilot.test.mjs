import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditLegacySnapshot } from '../pilot/open-mercato/audit-legacy.mjs';

const fixture=()=>({
 version:1,
 styles:[{id:'s1',code:'SH',variants:[{id:'v1',sku:'SH-M-BLK',size:'M',color:'أسود'}],
   bom:[{materialId:'m1',qty:2}]}],
 materials:[{id:'m1',code:'FAB',stock:8,avgCost:50}],
 orders:[{id:'w1',ref:'WO-1',styleId:'s1',variantId:'v1',status:'completed',qty:2}],
 ledger:[{materialId:'m1',qty:12},{materialId:'m1',qty:-4}],
 finished:[{orderId:'w1',variantId:'v1',qty:2,unitCost:100}],
 workers:[],workLogs:[],fabricRolls:[],cuttingBundles:[],
 wholesaleOrders:[{id:'so1',lines:[{variantId:'v1',qty:1,unitPrice:150}]}],
 finishedDispatches:[{orderId:'so1',reference:'DO-1',lines:[{variantId:'v1',qty:1}]}],
});
test('standalone WMS pilot uses pinned official scaffolder without touching deployment or databases',()=>{
 const s=readFileSync(new URL('../pilot/open-mercato/bootstrap.sh',import.meta.url),'utf8');
 const workflow=readFileSync(new URL('../.github/workflows/open-mercato-pilot.yml',import.meta.url),'utf8');
 const notice=readFileSync(new URL('../pilot/open-mercato/THIRD_PARTY_LICENSE.txt',import.meta.url),'utf8');
 assert.match(s,/create-mercato-app@0\.9\.0 garments-ops --preset wms --agents none --no-init-git/);
 assert.match(s,/test -f garments-ops\/src\/modules\.ts/);
 assert.match(s,/auth customers catalog sales wms audit_logs/);
 assert.match(notice,/MIT License/);
 assert.match(notice,/Open Mercato contributors/);
 assert.match(workflow,/contents: read/);
 assert.match(workflow,/actions\/upload-artifact@v4/);
 assert.doesNotMatch(workflow,/deploy-pages|DATABASE_URL|service_role|yarn db:migrate/);
});
test('snapshot audit summarizes healthy legacy stock and does not leak customers',()=>{
 const input=fixture();
 const original=structuredClone(input);
 const report=auditLegacySnapshot(input);
 assert.deepEqual(report.blockers,[]);
 assert.equal(report.counts.sku,1);
 assert.equal(report.counts.wholesaleOrders,1);
 assert.equal(report.counts.finishedDispatches,1);
 assert.equal(report.readyForAutomaticImport,false);
 assert.match(report.warnings.join(','),/FULFILLMENT_HISTORY_REQUIRES_IDEMPOTENT_IMPORT/);
 assert.ok(!JSON.stringify(report).includes('SH-M-BLK'));
 assert.deepEqual(input,original);
});
test('snapshot audit fails on demo data, duplicate SKU, broken BOM and stock mismatch',()=>{
 const input=fixture();input.demoMode=true;
 assert.ok(auditLegacySnapshot(input).blockers.includes('DEMO_DATA_MUST_NOT_MIGRATE'));
 input.demoMode=false;
 input.materials[0].stock=400;
 assert.ok(auditLegacySnapshot(input).blockers.includes('RAW_LEDGER_BALANCE_MISMATCH'));
 input.materials[0].stock=8;
 input.styles[0].variants.push({id:'v2',sku:'SH-M-BLK'});
 assert.ok(auditLegacySnapshot(input).blockers.includes('DUPLICATE_OR_MISSING_SKU'));
 input.styles[0].bom=[{materialId:'deleted',qty:2}];
 assert.ok(auditLegacySnapshot(input).blockers.includes('BOM_MISSING_MATERIAL'));
});
test('snapshot audit detects overdelivery and missing work order references',()=>{
 const input=fixture();
 input.finishedDispatches[0].lines[0].qty=3;
 input.orders[0].styleId='missing';
 const report=auditLegacySnapshot(input);
 assert.ok(report.blockers.includes('NEGATIVE_FINISHED_STOCK'));
 assert.ok(report.blockers.includes('SHIPMENT_EXCEEDS_ORDER'));
 assert.ok(report.blockers.includes('ORDER_BROKEN_REFERENCE'));
});
test('domain map specifies all existing factory collections and isolates production-only features',()=>{
 const map=JSON.parse(readFileSync(new URL('../pilot/open-mercato/domain-map.json',import.meta.url),'utf8'));
 const collections=['styles','materials','fabricRolls','workers','orders','workLogs','cuttingBundles','finished',
   'wholesaleOrders','finishedDispatches','central_intake_orders'];
 for(const key of collections)assert.ok(map.records.some(x=>x.legacy===key),key+' not represented');
 assert.equal(map.framework.license,'MIT');
 assert.equal(map.migration_mode,'dry_run_only');
 assert.ok(map.records.some(x=>x.target==='garments.work_orders'&&x.status==='not_implemented'));
 assert.ok(map.operational_prerequisites.includes('dedicated_isolated_postgres_database'));
});
