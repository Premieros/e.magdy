/**
 * PremierOS Garments single-Supabase-project lock.
 * Only project yumeijsyiphzdsulsubf is permitted.
 * Open Mercato must use a non-privileged login scoped to garments_ops.
 */
export const ALLOWED_SUPABASE_PROJECT_REF = 'yumeijsyiphzdsulsubf';
export const GARMENTS_DATABASE_SCHEMA = 'garments_ops';
const ROOT_ERROR='PremierOS Garments: رفض الاتصال بمشروع Supabase غير مصرح به';
function checkSearchPath(value){
  const s=String(value||'').trim().replace(/\s+/g,' ');
  const expected='-c search_path='+GARMENTS_DATABASE_SCHEMA;
  if(s!==expected && s!=='-csearch_path='+GARMENTS_DATABASE_SCHEMA)
    throw Error('PremierOS Garments: search_path must contain ONLY garments_ops');
}
export function assertAllowedProjectRef(projectRef){
  if(projectRef!==ALLOWED_SUPABASE_PROJECT_REF)throw Error(ROOT_ERROR);
  return ALLOWED_SUPABASE_PROJECT_REF;
}
export function assertAllowedSupabaseApiUrl(apiUrl){
  let url;
  try{url=new URL(apiUrl);}catch{throw Error(ROOT_ERROR);}
  if(url.protocol!=='https:'||url.hostname!==ALLOWED_SUPABASE_PROJECT_REF+'.supabase.co'
    ||url.username||url.password||url.port||url.search||url.hash||url.pathname!=='/')
    throw Error(ROOT_ERROR);
  return url.origin;
}
/** Validate host, username, schema, db and options, without EVER printing credentials. */
export function assertAllowedDatabaseUrl(raw){
  if(!raw||typeof raw!=='string')throw Error('DATABASE_URL is required for allowed Supabase project');
  let u;
  try{u=new URL(raw);}catch{throw Error(ROOT_ERROR);}
  if(!['postgres:','postgresql:'].includes(u.protocol))throw Error(ROOT_ERROR);
  if(u.pathname!=='/postgres')throw Error('Garments must target the postgres database only');
  if(u.hash||!u.password)throw Error('DATABASE_URL requires a secure password and no fragment');
  const direct=u.hostname==='db.'+ALLOWED_SUPABASE_PROJECT_REF+'.supabase.co';
  const username=decodeURIComponent(u.username);
  const pooler=/^[a-z0-9.-]+\.pooler\.supabase\.com$/.test(u.hostname)
    &&username.endsWith('.'+ALLOWED_SUPABASE_PROJECT_REF);
  if(!direct&&!pooler)throw Error(ROOT_ERROR);
  // Reject postgres admin logins. App runtime must use a schema-limited DB role.
  if(direct && username!=='garments_ops_login')throw Error('Use only garments_ops_login, not database admin');
  if(pooler && username!=='garments_ops_login.'+ALLOWED_SUPABASE_PROJECT_REF)
    throw Error('Use only project-scoped garments_ops_login pooler user');
  if(!['5432','6543'].includes(u.port))throw Error('Only Supabase PostgreSQL ports are supported');
  const params=[...u.searchParams.entries()];
  if(params.length!==1||params[0][0]!=='options')throw Error('DATABASE_URL must set an exclusive schema search_path');
  checkSearchPath(params[0][1]);
  return {projectRef:ALLOWED_SUPABASE_PROJECT_REF,schema:GARMENTS_DATABASE_SCHEMA,
    connectionType:direct?'direct':'pooler'};
}
export function assertRuntimeConfig(env){
  if(env.SUPABASE_PROJECT_REF!==ALLOWED_SUPABASE_PROJECT_REF)
    throw Error('Set SUPABASE_PROJECT_REF to the only permitted project');
  if(env.GARMENTS_DB_SCHEMA!==GARMENTS_DATABASE_SCHEMA)
    throw Error('Set GARMENTS_DB_SCHEMA to garments_ops');
  if(env.NEXT_PUBLIC_SUPABASE_URL)
    assertAllowedSupabaseApiUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  if(env.SUPABASE_URL)assertAllowedSupabaseApiUrl(env.SUPABASE_URL);
  return assertAllowedDatabaseUrl(env.DATABASE_URL);
}
if(/(?:^|\/)\w*target-policy\.mjs$/.test(process.argv[1]||'')){
  try{
    const result=assertRuntimeConfig(process.env);
    console.log('Garments DB target verified: '+result.projectRef+' / '+result.schema+' / '+result.connectionType);
  }catch(err){
    console.error('Garments database target check failed: '+err.message);
    process.exitCode=1;
  }
}
