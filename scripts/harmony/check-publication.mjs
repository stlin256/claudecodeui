import { execFileSync } from 'node:child_process';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const files = git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z').split('\0').filter(Boolean);
const hosts = (process.env.HARMONY_PRIVATE_HOSTS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
const failures = [];
for (const file of files) {
  if (/(?:^|\/)(?:runtime-config\.json|huawei_api_key\.txt|local\.properties)$/.test(file) ||
      /(?:^|\/)(?:\.artifacts|material|oh_modules)\//.test(file) ||
      /\.(?:p12|p7b|hap|app|keystore)$/.test(file) || file === 'apps/harmony/build-profile.json5') {
    failures.push(`${file}: local-only file`);
    continue;
  }
  const content = git('show', `:${file}`);
  if (hosts.some(host => content.toLowerCase().includes(host))) failures.push(`${file}: private hostname`);
  if (/-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/.test(content)) failures.push(`${file}: private key material`);
  if (/"(?:private_key|sub_account)"\s*:\s*"[^"\r\n]+"/.test(content)) failures.push(`${file}: service account material`);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Publication guard passed for ${files.length} staged files.`);
}
