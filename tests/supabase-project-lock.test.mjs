import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
 ALLOWED_SUPABASE_PROJECT_REF, GARMENTS_DATABASE_SCHEMA,
 assertAllowedDatabaseUrl, assertAllowedProjectRef, assertRuntimeConfig
} from '../pilot/open-mercato/target-policy.mjs';

const project='yumeijsyiphzdsulsubf';
const direct='postgresql://garments_ops_login:dummy@db.'+project+'.supabase.co:5432/postgres?options=-c%20search_path%3Dgarments_ops';
const pool='postgresql://garments_ops_login.'+project+':dummy@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?options=-c%20search_path%3Dgarments_ops';
test('hard-coded sole Supabase project cannot be substituted',()=>{
 assert.equal(ALLOWED_SUPABASE_PROJECT_REF,project);
 assert.equal(GARMENTS_DATABASE_SCHEMA,'garments_ops');
 assert.equal(assertAllowedProjectRef(project),project);
 assert.throws(()=>assertAllowedProjectRef('another-project'));
});
test('DB URLs accept only restricted garments login on approved project and schema',()=>{
 assert.equal(assertAllowedDatabaseUrl(direct).projectRef,project);
 assert.equal(assertAllowedDatabaseUrl(pool).connectionType,'pooler');
 for(const value of [
  direct.replace('db.'+project+'.supabase.co','db.other-project.supabase.co'),
  direct.replace('garments_ops_login','postgres'),
  direct.replace('search_path%3Dgarments_ops','search_path%3Dpublic'),
  direct.replace('search_path%3Dgarments_ops','search_path%3Dgarments_ops%2Cpublic'),
  direct.replace('/postgres?','/wrong?'),
  direct.replace(':5432/',':6666/'),
  pool.replace('garments_ops_login.'+project,'postgres.other-project')
 ])assert.throws(()=>assertAllowedDatabaseUrl(value));
});
test('runtime environment must explicitly match project and schema',()=>{
 const good={DATABASE_URL:direct,SUPABASE_PROJECT_REF:project,GARMENTS_DB_SCHEMA:'garments_ops'};
 assert.equal(assertRuntimeConfig(good).schema,'garments_ops');
 assert.throws(()=>assertRuntimeConfig({...good,SUPABASE_PROJECT_REF:'wrong'}));
 assert.throws(()=>assertRuntimeConfig({...good,GARMENTS_DB_SCHEMA:'public'}));
});
test('isolated schema and NOLOGIN role migration are additive only',()=>{
 const sql=readFileSync(new URL('../database/garments_ops_project_lock.sql',import.meta.url),'utf8');
 const role=readFileSync(new URL('../database/garments_ops_restricted_role.sql',import.meta.url),'utf8');
 assert.match(sql,/CREATE SCHEMA IF NOT EXISTS garments_ops/);
 assert.match(sql,/CHECK \(project_ref = 'yumeijsyiphzdsulsubf'\)/);
 assert.match(role,/CREATE ROLE garments_ops_login NOLOGIN NOSUPERUSER/);
 assert.doesNotMatch(sql+role,/\bDROP TABLE\b|\bTRUNCATE TABLE\b/i);
});
test('generated Open Mercato code is configured to fail closed on other projects',()=>{
 const s=readFileSync(new URL('../pilot/open-mercato/bootstrap.sh',import.meta.url),'utf8');
 assert.match(s,/garments-target-policy\.mjs/);
 assert.match(s,/Destructive reset disabled on shared Supabase project/);
 assert.match(s,/SUPABASE_PROJECT_REF=yumeijsyiphzdsulsubf/);
 assert.match(s,/search_path%3Dgarments_ops/);
});

test('command-line database policy refuses a foreign project and accepts only the approved one',()=>{
 const script=fileURLToPath(new URL('../pilot/open-mercato/target-policy.mjs',import.meta.url));
 const bad=spawnSync(process.execPath,[script],{encoding:'utf8',env:{
   ...process.env,DATABASE_URL:direct,SUPABASE_PROJECT_REF:'wrong-project',GARMENTS_DB_SCHEMA:'garments_ops'
 }});
 assert.notEqual(bad.status,0);
 assert.match(bad.stderr,/check failed/);
 const good=spawnSync(process.execPath,[script],{encoding:'utf8',env:{
   ...process.env,DATABASE_URL:direct,SUPABASE_PROJECT_REF:project,GARMENTS_DB_SCHEMA:'garments_ops'
 }});
 assert.equal(good.status,0,good.stderr);
 assert.match(good.stdout,/Garments DB target verified/);
 assert.doesNotMatch(good.stdout,/dummy/);
});
test('legacy client URL remains pinned to the same Supabase project',()=>{
 const s=readFileSync(new URL('../src/cloud-backup.mjs',import.meta.url),'utf8');
 assert.match(s,/const BASE_URL = 'https:\/\/yumeijsyiphzdsulsubf\.supabase\.co'/);
});
