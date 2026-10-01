const pattern = /(?:^|\n)#{1,4}[^\n]*?(?:具体的な問題|問題点?|Problem|Issue|\bWhat\b)/i;
const body = `### 💡 What: Replaced the sequential \`for...of\` loops for file deletions and copy restorations during \`BackupService\` rollbacks with chunked parallel execution using \`Promise.allSettled\` and a concurrency limit of 25.`;
console.log("Match What:", pattern.test(body));
