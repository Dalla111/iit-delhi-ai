const fs = require('fs');
const path = require('path');

// Read environment variables
const geminiApiKey = process.env.GEMINI_API_KEY;
const databasePairs = process.env.DATABASE_PAIRS;

// Path to index.html
const indexPath = path.join(__dirname, 'public', 'index.html');

// Read and update index.html
fs.readFile(indexPath, 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading index.html:', err);
    process.exit(1);
  }

  const updatedData = data
    .replace('{{GEMINI_API_KEY}}', geminiApiKey)
    .replace('{{DATABASE_PAIRS}}', databasePairs);

  fs.writeFile(indexPath, updatedData, 'utf8', (err) => {
    if (err) {
      console.error('Error writing index.html:', err);
      process.exit(1);
    }
    console.log('Environment variables injected successfully');
  });
});
