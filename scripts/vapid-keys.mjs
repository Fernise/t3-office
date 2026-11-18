/** Generates a VAPID P-256 key pair for Web Push. Usage: node scripts/vapid-keys.mjs <output.json>
 *  The private key goes ONLY into the owner-only (0600) file you name, never to the terminal; stdout shows the public key. Put the file outside the repository or under an ignored path such as .local/. */
import{writeFileSync}from'node:fs';
const out=process.argv[2];if(!out){console.error('Usage: node scripts/vapid-keys.mjs <output.json>');process.exit(2);}
const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const b64u=b=>Buffer.from(b).toString('base64url');
const publicKey=b64u(await crypto.subtle.exportKey('raw',pair.publicKey)),privateKey=(await crypto.subtle.exportKey('jwk',pair.privateKey)).d;
writeFileSync(out,JSON.stringify({VAPID_PUBLIC_KEY:publicKey,VAPID_PRIVATE_KEY:privateKey},null,1)+'\n',{mode:0o600,flag:'wx'});
console.log('VAPID_PUBLIC_KEY='+publicKey);console.log('Private key written to '+out+' (mode 600).');
