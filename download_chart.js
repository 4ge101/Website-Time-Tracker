const fs = require('fs');
const https = require('https');

const url = 'https://cdn.jsdelivr.net/npm/chart.js';
const outputPath = 'chart.js';

https.get(url, (response) => {
  let data = '';
  response.on('data', (chunk) => {
    data += chunk;
  });
  response.on('end', () => {
    fs.writeFile(outputPath, data, (err) => {
      if (err) throw err;
      console.log('Chart.js has been downloaded and saved!');
    });
  });
}).on('error', (err) => {
  console.error('Error downloading Chart.js:', err.message);
});
