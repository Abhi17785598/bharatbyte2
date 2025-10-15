import dotenv from 'dotenv';
import app from './app.js';

dotenv.config();

const port = process.env.PORT || 4040;

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});