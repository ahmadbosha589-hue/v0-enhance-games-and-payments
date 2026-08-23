
const fs=require('fs');
for(const l of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim().replace(/^(["'])(.*)\1$/,'$2')}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;
if(!url||!key){console.log('missing keys');process.exit(1)}
fetch(url+'/auth/v1/admin/users?page=1&per_page=50',{
  headers:{apikey:key,Authorization:'Bearer '+key}
}).then(r=>r.json()).then(d=>{
  const users=(d.users||[]).filter(u=>(u.email||'').includes('faucero.adtest'));
  for(const u of users){
    console.log('found:', u.id, u.email, 'confirmed:', u.email_confirmed_at!=null);
  }
  if(users.length===0) console.log('user not found');
}).catch(e=>console.log('ERR',e.message));
