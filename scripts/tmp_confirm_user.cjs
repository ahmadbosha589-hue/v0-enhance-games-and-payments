const fs=require('fs');
for(const l of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim().replace(/^(["'])(.*)\1$/,'$2')}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;
fetch(url+'/auth/v1/admin/users/85204e21-5494-461b-816b-651f5ea3fd7e',{
  method:'PUT',
  headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},
  body: JSON.stringify({email_confirm:true})
}).then(r=>r.json()).then(d=>{
  console.log('confirmed:', d.email_confirmed_at!=null);
}).catch(e=>console.log('ERR',e.message));
