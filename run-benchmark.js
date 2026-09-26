const { performance } = require('perf_hooks');

// Mock implementation
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const getInfoAsync = async (path) => {
  await sleep(2); // Simulate 2ms I/O for stat
  return { exists: path.includes('exists') };
};

const copyAsync = async (opts) => {
  await sleep(10); // Simulate 10ms I/O for copy
};

const uniquePhotosToRestore = new Set();
for(let i=0; i<100; i++) {
  uniquePhotosToRestore.add(i % 2 === 0 ? `file_exists_${i}.jpg` : `file_new_${i}.jpg`);
}

const targetDocDir = 'target/';
const rollbackDir = 'rollback/';

async function runSequential() {
  const start = performance.now();
  for (const fileName of uniquePhotosToRestore) {
    const destPath = `${targetDocDir}${fileName}`;
    const destInfo = await getInfoAsync(destPath);
    if (destInfo.exists) {
      await copyAsync({ from: destPath, to: `${rollbackDir}${fileName}` });
    }
  }
  return performance.now() - start;
}

async function runChunked(chunkSize) {
  const start = performance.now();
  const items = Array.from(uniquePhotosToRestore);
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await Promise.all(chunk.map(async (fileName) => {
      const destPath = `${targetDocDir}${fileName}`;
      const destInfo = await getInfoAsync(destPath);
      if (destInfo.exists) {
        await copyAsync({ from: destPath, to: `${rollbackDir}${fileName}` });
      }
    }));
  }
  return performance.now() - start;
}

async function main() {
  const seq = await runSequential();
  console.log(`Sequential: ${seq} ms`);

  const chunked10 = await runChunked(10);
  console.log(`Chunked (10): ${chunked10} ms`);

  const chunked25 = await runChunked(25);
  console.log(`Chunked (25): ${chunked25} ms`);
}

main();
