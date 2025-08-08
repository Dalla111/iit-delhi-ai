const fs = require('fs');
const path = require('path');

console.log('Starting environment variable injection...');

// Read environment variables
const geminiApiKey = process.env.GEMINI_API_KEY;
const databasePairs = process.env.DATABASE_PAIRS;

console.log(`Gemini Key Length: ${geminiApiKey?.length || 0}`);
console.log(`Database Pairs Length: ${databasePairs?.length || 0}`);

if (!geminiApiKey || !databasePairs) {
    console.error('Missing required environment variables');
    process.exit(1);
}

// Try to parse databasePairs as JSON, if it fails use it as-is
let parsedDatabasePairs;
try {
    parsedDatabasePairs = JSON.parse(databasePairs);
    console.log('Successfully parsed DATABASE_PAIRS as JSON');
} catch (e) {
    console.log('Could not parse DATABASE_PAIRS as JSON, using as string');
    parsedDatabasePairs = databasePairs;
}

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
        .replace('{{DATABASE_PAIRS}}', JSON.stringify(parsedDatabasePairs));

    fs.writeFile(indexPath, updatedData, 'utf8', (err) => {
        if (err) {
            console.error('Error writing index.html:', err);
            process.exit(1);
        }
        console.log('Environment variables injected successfully');
    });
});
