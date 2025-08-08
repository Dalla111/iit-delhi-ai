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

// Path to index.html
const indexPath = path.join(__dirname, 'public', 'index.html');

// Convert to valid JSON format if needed
let formattedDatabasePairs;
try {
    // Try to parse as JSON first
    JSON.parse(databasePairs);
    formattedDatabasePairs = databasePairs;
    console.log('DATABASE_PAIRS is already valid JSON');
} catch (e) {
    console.log('Converting DATABASE_PAIRS to valid JSON format');
    
    // Convert JavaScript object literals to valid JSON
    formattedDatabasePairs = databasePairs
        // Remove surrounding quotes if present
        .replace(/^['"]|['"]$/g, '')
        // Wrap property names in double quotes
        .replace(/(\w+)\s*:/g, '"$1":')
        // Convert single quotes to double quotes
        .replace(/'/g, '"');
    
    console.log('Formatted DATABASE_PAIRS:', formattedDatabasePairs);
}

// Read and update index.html
fs.readFile(indexPath, 'utf8', (err, data) => {
    if (err) {
        console.error('Error reading index.html:', err);
        process.exit(1);
    }

    const updatedData = data
        .replace('{{GEMINI_API_KEY}}', geminiApiKey)
        .replace('{{DATABASE_PAIRS}}', formattedDatabasePairs);

    fs.writeFile(indexPath, updatedData, 'utf8', (err) => {
        if (err) {
            console.error('Error writing index.html:', err);
            process.exit(1);
        }
        console.log('Environment variables injected successfully');
    });
});
