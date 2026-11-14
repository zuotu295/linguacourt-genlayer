import test from 'node:test';
import assert from 'node:assert/strict';
import {createJournaledFetch} from '../scripts/rpc_journal.mjs';
const body=JSON.stringify({method:'eth_sendRawTransaction',params:['0xsigned']});
test('signed submission saved before HTTP and hash saved before returning',async()=>{
  const events=[]; const hash='0x'+'a'.repeat(64);
  const fetch=createJournaledFetch({getLabel:()=> 'submit',onEvent:e=>events.push(e),fetchImpl:async()=>{
    assert.equal(events[0].stage,'before_broadcast');
    assert.equal(events[0].serialized_transaction,'0xsigned');
    return new Response(JSON.stringify({result:hash}));
  }});
  await fetch('https://studio.genlayer.com/api',{body});
  assert.equal(events[1].hash,hash);
});
test('HTML response is ambiguous and cannot trigger a second broadcast',async()=>{
  const events=[];let sends=0;
  const fetch=createJournaledFetch({getLabel:()=> 'submit',onEvent:e=>events.push(e),fetchImpl:async()=>{
    sends++;return new Response('<!DOCTYPE html>Unavailable',{status:503});
  }});
  await fetch('https://studio.genlayer.com/api',{body});
  assert.equal(events[1].stage,'ambiguous_response');
  await assert.rejects(fetch('https://studio.genlayer.com/api',{body}),/BROADCAST_ALREADY_ATTEMPTED/);
  assert.equal(sends,1);
});
test('transport exception remains ambiguous and is not retried',async()=>{
  const events=[];let sends=0;
  const fetch=createJournaledFetch({getLabel:()=> 'submit',onEvent:e=>events.push(e),fetchImpl:async()=>{sends++;throw new Error('connection reset')}});
  await assert.rejects(fetch('https://studio.genlayer.com/api',{body}),/connection reset/);
  await assert.rejects(fetch('https://studio.genlayer.com/api',{body}),/BROADCAST_ALREADY_ATTEMPTED/);
  assert.equal(events[1].stage,'ambiguous_response');assert.equal(sends,1);
});
test('read requests pass through without any broadcast event',async()=>{
  const events=[];
  const fetch=createJournaledFetch({getLabel:()=>null,onEvent:e=>events.push(e),fetchImpl:async()=>new Response('{}')});
  await fetch('https://studio.genlayer.com/api',{body:JSON.stringify({method:'eth_chainId'})});
  assert.equal(events.length,0);
});
