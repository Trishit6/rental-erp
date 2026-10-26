p='src/lib/api/client.ts'
s=open(p).read()
# try to add header
if 'X-Client-Version' not in s:
    # add near fetch
    s2 = s.replace("const res = await fetch(url, {\n        method,\n        headers,", "const headers: Record<string,string> = {\n          ...(init.headers as Record<string,string>||{}),\n        };\n        try{const pkg=require('../../../package.json');headers['X-Client-Version']=pkg?.version?String(pkg.version):'dev';}catch{headers['X-Client-Version']='dev';}\n        const res = await fetch(url, {\n        method,\n        headers,")
    if s2 == s:
        # fallback
        pass
    open(p,'w').write(s2)
print('done')
