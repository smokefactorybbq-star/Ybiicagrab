const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const ts=require(path.join(root,'node_modules/typescript'));
function load(name,mocks={}){const code=ts.transpileModule(fs.readFileSync(path.join(root,name),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;const m={exports:{}};vm.runInNewContext(code,{module:m,exports:m.exports,require:n=>{if(n in mocks)return mocks[n];return require(n)},process,URL,Buffer,AbortSignal,console,fetch:global.fetch,setTimeout,clearTimeout},{filename:name});return m.exports;}
const c=load('lib/limenthai-contract.ts');
const quote={amount_thb:'1000.00',amount_rub:'2678.00',rate:'2.6775',unit:'RUB за 1 THB',valid_until:'2099-01-01T00:00:00Z'};let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
test('valid quote preserves provider rounding',()=>assert.equal(c.validateQuote(quote,'1000.00').amount_rub,'2678.00'));
for(const patch of [{amount_thb:'99.00'},{amount_rub:'0.00'},{valid_until:'2000-01-01T00:00:00Z'},{unit:'RUB за 1 USDT'}])test('reject bad quote '+JSON.stringify(patch),()=>assert.throws(()=>c.validateQuote({...quote,...patch},'1000.00')));
test('THB amount string',()=>assert.equal(c.thbAmount(1000),'1000.00'));
test('reject fractional site total',()=>assert.throws(()=>c.thbAmount(1.001)));
test('reject negative site total',()=>assert.throws(()=>c.thbAmount(-1)));
for(const val of ['NaN','Infinity','1e5','-1','0.001'])test('reject invalid money '+val,()=>assert.throws(()=>c.decimal(val,2)));
const expected={partner_id:'SF-abc',provider_id:'ord_1',amount_rub:'2678.00',amount_thb:'1000.00',rate:'2.6775'};
const order={order_id:'ord_1',partner_order_id:'SF-abc',status:'paid',amount_rub:'2678.00',rate:'2.6775',amount_thb:'1000.00',settlement_currency:'THB',paid_at:'2026-11-16T12:00:00+07:00'};
test('accept documented paid response',()=>assert.equal(c.validateOrder(order,expected).status,'paid'));
for(const patch of [{amount_rub:'1.00'},{amount_thb:'999.00'},{settlement_currency:'USDT'},{rate:'3.00'},{order_id:'ord_other'},{partner_order_id:'other'},{status:'success'},{paid_at:'invalid'}])test('reject mismatched order '+JSON.stringify(patch),()=>assert.throws(()=>c.validateOrder({...order,...patch},expected)));
test('allow documented SBP host',()=>assert.equal(c.paymentUrl('https://qr.nspk.ru/abc'),'https://qr.nspk.ru/abc'));
for(const url of ['javascript:alert(1)','https://evil.test','https://qr.nspk.ru.evil.test/','https://user:pass@qr.nspk.ru/'])test('reject unsafe URL '+url,()=>assert.throws(()=>c.paymentUrl(url)));
// Exercise real sync module with an in-memory transaction adapter and provider stub.
let payment,sub,calls,activations,receipts,dayUpdates;
function reset(test){payment={subscription_id:'id',partner_id:'SF-id',provider_id:null,amount_rub:null,total_thb:1000,contract_version:'THB_V1',payer_phone:'+79161234567',provider_rate:null,test,state:'creating',payment_url:null,expires_at:null,lease:null,activated:false};sub={id:'id',user_id:'owner',payment_method:'BANK_RU',status:'AWAITING_ACTIVATION',total_thb:1000};calls=[];activations=0;receipts=0;dayUpdates=0;}
async function query(sql,args=[]){
 if(sql.startsWith('SELECT id,user_id')||sql.startsWith('SELECT status,payment_method'))return {rows:[sub]};
 if(sql.startsWith('SELECT * FROM limenthai_payments'))return {rows:[{...payment}]};
 if(sql.includes('SELECT p.*'))return {rows:(!args[1]||args[1]===sub.user_id)?[{...payment}]:[]};
 if(sql.includes('SET lease=$2')){payment.lease=args[1];return {rowCount:1,rows:[]};}
 if(sql.includes("SET quoted_rate=$3,state='creating'")){payment.state='creating';return {rowCount:1};}
 if(sql.includes('SET provider_id=$2')){Object.assign(payment,{provider_id:args[1],state:args[2],amount_rub:args[4],provider_rate:args[3],payment_url:args[5],expires_at:args[6],last_error:args[7],lease:null});return {rowCount:1};}
 if(sql.includes("UPDATE subscriptions SET status='ACTIVE'")){sub.status='ACTIVE';activations++;return {rowCount:1};}
 if(sql.includes("VALUES('LIMENTHAI_PAYMENT_RECEIVED'"))receipts++;
 if(sql.includes("UPDATE subscription_days SET status='AVAILABLE'"))dayUpdates++;
 if(sql.includes('SET activated=true'))payment.activated=true;
 if(sql.includes('SET lease=NULL'))payment.lease=null;
 return {rowCount:1,rows:[]};
}
process.env.LIMENTHAI_ENABLED='true';process.env.LIMENTHAI_API_KEY='lt_test_example';delete process.env.LIMENTHAI_THB_PER_USDT;
let failHttp=false, providerOverride=null;
global.fetch=async(url,opts)=>{calls.push({url,opts});if(failHttp)return {ok:false,status:401,json:async()=>({error:{code:'invalid_api_key',message:'lt_live_SECRET_SHOULD_NOT_LEAK'}})};return {ok:true,json:async()=>url.includes('/quote?')?quote:(providerOverride||{...order,order_id:'ord_1',partner_order_id:'SF-id'})};};
const l=load('lib/limenthai.ts',{'./db':{query,withTransaction:fn=>fn({query})},'./subscriptions':{createSubscriptionCode:()=> 'code'},'./telegram':{notifyManagerTelegram:async()=>true},'./limenthai-contract':c,qrcode:{toDataURL:async()=> 'data:image/png;base64,AA'}});
(async()=>{
 reset(true);await l.syncLimen('id','owner');assert.equal(activations,0);assert.equal(payment.state,'paid');console.log('PASS test payment never activates');
 reset(false);process.env.LIMENTHAI_API_KEY='lt_live_example';process.env.LIMENTHAI_THB_PER_USDT='34';await l.syncLimen('id','owner');await l.syncLimen('id','owner');assert.equal(activations,0);assert.equal(dayUpdates,0);assert.equal(sub.status,'AWAITING_ACTIVATION');assert.equal(receipts,1);assert.equal(calls.length,1);assert.equal(JSON.parse(calls[0].opts.body).amount_thb,'1000.00');assert.equal('amount_rub' in JSON.parse(calls[0].opts.body),false);assert.equal(JSON.parse(calls[0].opts.body).payer_phone,'+79161234567');assert.equal(calls[0].opts.headers['Idempotency-Key'],'SF-id');console.log('PASS paid retry records receipt once without activation or meal availability');
 reset(false);await assert.rejects(()=>l.syncLimen('id','intruder'));assert.equal(calls.length,0);console.log('PASS ownership checked before provider request');
 reset(true);await assert.rejects(()=>l.syncLimen('id','owner'));assert.equal(calls.length,0);console.log('PASS key mode mismatch blocks requests');
 reset(false);payment.contract_version='LEGACY_USDT';await assert.rejects(()=>l.syncLimen('id','owner'));assert.equal(calls.length,0);console.log('PASS old contract is never retried as THB');
 reset(false);payment.state='new';await l.syncLimen('id','owner','2678.00');assert.equal(calls.length,2);assert.ok(calls[0].url.includes('/quote?'));assert.equal(JSON.parse(calls[1].opts.body).amount_thb,'1000.00');assert.equal(payment.amount_rub,'2678.00');console.log('PASS payment click validates quote and uses provider rounding');
 reset(false);payment.state='new';await l.syncLimen('id','owner');assert.equal(calls.length,0);assert.equal(payment.state,'new');console.log('PASS status does not create payment');
 reset(false);payment.state='new';const preview=await l.quoteLimen('id','owner');assert.equal(preview.amountRub,'2678.00');assert.equal(calls.length,1);assert.ok(calls[0].url.includes('/quote?'));assert.equal(payment.state,'new');console.log('PASS modal quote never creates order');
 reset(false);payment.state='new';await assert.rejects(()=>l.syncLimen('id','owner','2500.00'));assert.equal(payment.state,'new');assert.equal(calls.length,1);console.log('PASS changed price never creates order');
 reset(false);payment.state='new';await assert.rejects(()=>l.quoteLimen('id','intruder'));assert.equal(calls.length,0);console.log('PASS quote ownership');
 reset(false);payment.state='new';failHttp=true;let diagnostic;try{await l.quoteLimen('id','owner');}catch(e){diagnostic=l.limenErrorCode(e);}failHttp=false;assert.equal(diagnostic,'LIMENTHAI_HTTP_401_INVALID_API_KEY');assert.ok(!diagnostic.includes('SECRET'));assert.equal(l.limenErrorCode(new Error('lt_live_SECRET')),'PROVIDER_UNAVAILABLE');console.log('PASS useful diagnostics exclude raw provider messages and keys');
 test('malformed URL is diagnosed',()=>assert.throws(()=>c.paymentUrl('/relative'),/INVALID_PAYMENT_URL/));
 test('unlisted HTTPS host blocked',()=>assert.throws(()=>c.paymentUrl('https://pay.example.com/token?secret=abc')));
 process.env.LIMENTHAI_PAYMENT_HOSTS='pay.example.com';
 test('explicit exact HTTPS host accepted',()=>assert.equal(c.paymentUrl('https://pay.example.com/pay'),'https://pay.example.com/pay'));
 test('subdomain spoof blocked',()=>assert.throws(()=>c.paymentUrl('https://pay.example.com.evil.test/pay')));
 test('diagnostic strips payment tokens',()=>assert.equal(c.paymentHost('https://pay.example.com/token?secret=abc'),'pay.example.com'));
 delete process.env.LIMENTHAI_PAYMENT_HOSTS;
 reset(false);providerOverride={...order,order_id:'ord_1',partner_order_id:'SF-id',status:'pending',payment_url:'https://pay.example.com/private-token?secret=abc',expires_at:'2099-01-01T00:00:00Z'};
 const blocked=await l.syncLimen('id','owner');assert.equal(payment.provider_id,'ord_1');assert.equal(payment.amount_rub,'2678.00');assert.equal(blocked.paymentUrl,null);assert.equal(blocked.paymentLinkIssue,true);console.log('PASS bad link preserves amount and provider ID without exposing URL');
 process.env.LIMENTHAI_PAYMENT_HOSTS='pay.example.com';
 const recovered=await l.syncLimen('id','owner');assert.equal(calls.length,2);assert.equal(calls[1].opts.method,'GET');assert.ok(calls[1].url.endsWith('/orders/ord_1'));assert.equal(recovered.paymentLinkIssue,false);assert.ok(recovered.paymentUrl.startsWith('https://pay.example.com/'));console.log('PASS configured host recovers existing order with no duplicate POST');
 delete process.env.LIMENTHAI_PAYMENT_HOSTS;providerOverride=null;
 test('confirmed sandbox URL works in test without variable',()=>assert.equal(c.paymentUrl('https://api.limenthai.com/partner-api/sandbox/ord_af80d11a8d8a',true),'https://api.limenthai.com/partner-api/sandbox/ord_af80d11a8d8a'));
 test('sandbox URL blocked in live mode',()=>assert.throws(()=>c.paymentUrl('https://api.limenthai.com/partner-api/sandbox/ord_af80d11a8d8a',false)));
 test('other provider paths not implicitly allowed',()=>assert.throws(()=>c.paymentUrl('https://api.limenthai.com/other',true)));
 reset(true);process.env.LIMENTHAI_API_KEY='lt_test_example';providerOverride={...order,order_id:'ord_1',partner_order_id:'SF-id',status:'pending',payment_url:'https://api.limenthai.com/partner-api/sandbox/ord_af80d11a8d8a',expires_at:'2099-01-01T00:00:00Z'};
 const sandboxPayment=await l.syncLimen('id','owner');assert.equal(sandboxPayment.paymentLinkIssue,false);assert.equal(sandboxPayment.paymentUrl,providerOverride.payment_url);assert.equal(sandboxPayment.amountRub,'2678.00');assert.equal(activations,0);console.log('PASS actual sandbox URL reaches frontend without configuration');
 providerOverride=null;
 const paidRecord={state:'paid',test:false,provider_id:'ord_1',contract_version:'THB_V1',total_thb:1000};
 test('manager can activate verified real paid order',()=>assert.doesNotThrow(()=>c.assertLimenManualActivation(paidRecord,1000)));
 for(const patch of [{state:'pending'},{state:'expired'},{state:'declined'},{test:true},{provider_id:null},{contract_version:'LEGACY_USDT'},{total_thb:999}])test('manual activation rejected '+JSON.stringify(patch),()=>assert.throws(()=>c.assertLimenManualActivation({...paidRecord,...patch},1000),/LIMENTHAI_PAYMENT_NOT_RECEIVED/));
 test('other manual payment methods unchanged',()=>assert.doesNotThrow(()=>c.assertLimenManualActivation(undefined,1000)));
 console.log(`${count+14} checks passed; transaction adapter is mocked, not real PostgreSQL.`);
})().catch(e=>{console.error(e);process.exitCode=1});
