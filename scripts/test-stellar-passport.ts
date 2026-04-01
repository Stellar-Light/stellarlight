import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function testStellarPassportAPI() {
  const apiKey = process.env.STELLAR_PASSPORT;
  
  if (!apiKey) {
    console.error('STELLAR_PASSPORT API key not found in environment variables');
    process.exit(1);
  }

  console.log('Testing Stellar Passport API...\n');
  
  try {
    // Test fetching all builder profiles
    const response = await fetch('https://demo.stellarpassport.xyz/api/v1/profiles', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`API Error: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error('Error details:', errorText);
      return;
    }

    const data = await response.json();
    console.log('API Response:', JSON.stringify(data, null, 2));
    
    // If there are builders, show the first one in detail
    if (data.builders && data.builders.length > 0) {
      console.log('\n--- First Builder Profile Structure ---');
      console.log(JSON.stringify(data.builders[0], null, 2));
    }
    
    // Try to fetch a specific builder (alexanderkoh)
    console.log('\n--- Fetching specific builder: alexanderkoh ---');
    const builderResponse = await fetch(`https://demo.stellarpassport.xyz/api/v1/profiles/alexanderkoh`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
      
    
    if (builderResponse.ok) {
      const builderData = await builderResponse.json();
      console.log('Single Builder Response:', JSON.stringify(builderData, null, 2));
    } else {
      console.error(`Failed to fetch specific builder: ${builderResponse.status}`);
    }
    
  } catch (error) {
    console.error('Error testing API:', error);
  }
}

testStellarPassportAPI();