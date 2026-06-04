// Generate self-signed TLS cert with SAN = localhost + 127.0.0.1 + current LAN IPv4
// Usage: npm run cert
const fs = require('fs');
const os = require('os');
const path = require('path');
const selfsigned = require('selfsigned');

function lanIPv4s() {
  const ips = [];
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const addr of ifs[name] || []) {
      if (addr.family === 'IPv4' && !addr.internal) ips.push(addr.address);
    }
  }
  return ips;
}

const ips = lanIPv4s();
console.log('[cert] LAN IPv4 detected:', ips.length ? ips.join(', ') : '(none)');

const altNames = [
  { type: 2, value: 'localhost' },
  { type: 7, ip: '127.0.0.1' },
  ...ips.map((ip) => ({ type: 7, ip })),
];

const attrs = [{ name: 'commonName', value: 'vr-phobia-ikan' }];
const pems = selfsigned.generate(attrs, {
  algorithm: 'sha256',
  days: 825,
  keySize: 2048,
  extensions: [
    { name: 'basicConstraints', cA: true },
    {
      name: 'keyUsage', keyCertSign: true, digitalSignature: true, keyEncipherment: true,
    },
    { name: 'extKeyUsage', serverAuth: true, clientAuth: true },
    { name: 'subjectAltName', altNames },
  ],
});

const outDir = path.join(__dirname, '..', 'server', 'cert');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'key.pem'), pems.private);
fs.writeFileSync(path.join(outDir, 'cert.pem'), pems.cert);
console.log('[cert] wrote', path.join(outDir, 'key.pem'));
console.log('[cert] wrote', path.join(outDir, 'cert.pem'));
console.log('[cert] On Quest, accept the security exception once per device.');
