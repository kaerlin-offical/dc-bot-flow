import 'dotenv/config';
import initDatabase from '../database/schema.js';
import { generateLicenseKey } from '../utils/security.js';
import { createLicense } from '../database/queries.js';
import { logger } from '../utils/logger.js';

console.log('\n🚀 Discord License Bot - Setup Wizard\n');

// Check environment variables
const requiredEnvVars = ['DISCORD_TOKEN', 'CLIENT_ID', 'ADMIN_IDS'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingVars.forEach(v => console.error(`   - ${v}`));
  console.error('\nPlease copy .env.example to .env and fill in the values.');
  process.exit(1);
}

console.log('✅ Environment variables configured');

// Initialize database
try {
  const db = initDatabase();
  console.log('✅ Database initialized successfully');
  
  // Generate 5 test licenses
  console.log('\n📝 Generating 5 test licenses...\n');
  
  const testLicenses = [];
  for (let i = 0; i < 5; i++) {
    const key = generateLicenseKey();
    createLicense(db, key, 'Setup Script', null);
    testLicenses.push(key);
  }
  
  console.log('Generated test licenses:');
  console.log('```');
  testLicenses.forEach((key, i) => {
    console.log(`${i + 1}. ${key}`);
  });
  console.log('```\n');
  
  console.log('✅ Setup complete!\n');
  console.log('Next steps:');
  console.log('1. Start the bot with: npm start');
  console.log('2. Invite the bot to your server using the URL in README.md');
  console.log('3. Use one of the test licenses above to test /signup\n');
  
  db.close();
  
} catch (error) {
  console.error('❌ Setup failed:', error.message);
  process.exit(1);
}
