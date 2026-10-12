// @vitest-environment node
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {PassThrough} from 'node:stream';
const mocks=vi.hoisted(()=>({getOne:vi.fn(),insert:vi.fn(),upload:vi.fn(),download:vi.fn(),remove:vi.fn()}));
vi.mock('../api/db.js',()=>({getOne:mocks.getOne,insert:mocks.insert}));
vi.mock('multer',()=>({default:Object.assign(()=>({single:()=> (req,res,done)=>done()}),{memoryStorage:()=>({})})}));
vi.mock('@replit/object-storage',()=>({Client:class {
 uploadFromBytes(...args){return mocks.upload(...args);}
 downloadAsStream(...args){return mocks.download(...args);}
 delete(...args){return mocks.remove(...args);}
}}));
import handler from '../api/client-history-attachment.js';
const fd={sub:'synthetic-fd',role:'frontdesk',branch:'townshop'};
async function call(method,extra={},user=fd){
 const out={status:200,headers:{}},res=new PassThrough();
 res.status=n=>{out.status=n;return res;};res.json=b=>{out.body=b;return res;};
 res.setHeader=(k,v)=>{out.headers[k]=v;};res.on('data',()=>{});
 await handler({method,user,url:'/api/client-history-attachment?clientId=client&attachmentId=file',...extra},res);
 return out;
}
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('DEFAULT_OBJECT_STORAGE_BUCKET_ID','synthetic-mock-bucket');
 vi.stubEnv('STOCK_AUDIT_ISOLATED','0');
 vi.stubEnv('CLIENT_HISTORY_PRIVATE_ATTACHMENTS_VERIFIED','true');
 mocks.getOne.mockImplementation(async sql=>sql.includes('FROM clients')?{id:'client',branch:'townshop'}:
  {id:'file',client_id:'client',object_name:'client-history-private/file',name:'paper.pdf',mime_type:'application/pdf'});
 mocks.insert.mockImplementation(async(table,row)=>row);mocks.upload.mockResolvedValue({ok:true});
 mocks.remove.mockResolvedValue({ok:true});
});
afterEach(()=>vi.unstubAllEnvs());
it('stores PDF bytes privately and returns only scoped metadata',async()=>{
 const b=Buffer.from('%PDF-1.4 synthetic');
 const r=await call('POST',{file:{buffer:b,mimetype:'application/pdf',originalname:'paper.pdf'}});
 expect(r.status).toBe(201);expect(r.body.attachment.name).toBe('paper.pdf');
 expect(mocks.upload.mock.calls[0][0]).toMatch(/^client-history-private\//);
 expect(mocks.insert.mock.calls[0][1].captured_by).toBe(fd.sub);
 expect(JSON.stringify(r.body)).not.toContain('object_name');
});
it('downloads only after branch authorization with private no-store headers',async()=>{
 const stream=new PassThrough();mocks.download.mockResolvedValue(stream);
 const r=await call('GET');expect(r.status).toBe(200);
 expect(r.headers['Cache-Control']).toBe('private, no-store');expect(r.headers['Content-Disposition']).toContain('attachment');
 stream.end('synthetic');
 expect((await call('GET',{}, {...fd,branch:'swakopmund'})).status).toBe(403);
 expect(mocks.download).toHaveBeenCalledTimes(1);
});
it('denies consultant uploads, rejects disguised files and never falls back to public storage',async()=>{
 const file={buffer:Buffer.from('<script>bad</script>'),mimetype:'application/pdf',originalname:'paper.pdf'};
 expect((await call('POST',{file},{...fd,role:'consultant'})).status).toBe(403);
 expect((await call('POST',{file})).status).toBe(400);
 expect(mocks.upload).not.toHaveBeenCalled();
 mocks.upload.mockResolvedValue({ok:false});
 file.buffer=Buffer.from('%PDF-1.4 synthetic');
 expect((await call('POST',{file})).status).toBe(503);expect(mocks.insert).not.toHaveBeenCalled();
});
