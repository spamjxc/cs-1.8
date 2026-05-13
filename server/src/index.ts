import express from 'express';
import path from 'path';

const app = express();
const PORT = 3000;
const clientDistPath = path.join(__dirname, '../../dist/client');

// Serve static files from dist/client
app.use(express.static(clientDistPath));

// Handle SPA routing - return index.html for all routes
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Static server running on http://localhost:${PORT}`);
});
