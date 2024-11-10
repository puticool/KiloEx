const fs = require('fs').promises;

async function processData(inputFile, outputFile) {
    try {
        const data = await fs.readFile(inputFile, 'utf8');
        
        const lines = data.split('\n');
        const processedLines = lines
            .filter(line => line.trim())
            .map(line => {
                try {
                    const userDataPart = line.split('user=')[1].split('&')[0];
                    
                    const decodedData = decodeURIComponent(userDataPart);
                    
                    const userData = JSON.parse(decodedData);
                    
                    // Format as required: id|username
                    return `${userData.id}|${userData.username}`;
                } catch (err) {
                    console.error('Error processing line:', line);
                    console.error(err);
                    return null;
                }
            })
            .filter(line => line !== null);

        await fs.writeFile(outputFile, processedLines.join('\n') + '\n');
        
        console.log(`Successfully processed and saved to file ${outputFile}`);
        console.log(`Number of lines processed: ${processedLines.length}`);

    } catch (err) {
        if (err.code === 'ENOENT') {
            console.error(`File ${inputFile} not found`);
        } else {
            console.error('An error occurred:', err);
        }
    }
}

processData('convert.txt', 'data.txt');