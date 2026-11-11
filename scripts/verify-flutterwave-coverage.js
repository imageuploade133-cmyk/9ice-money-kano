const fs = require('fs');
const path = require('path');
const https = require('https');

// Load environment variables from payment-gateway/.env
const envPath = path.join(__dirname, '../payment-gateway/.env');
let flwSecretKey = '';

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/FLW_SECRET_KEY=([^\r\n]+)/);
  if (match) {
    flwSecretKey = match[1].trim().replace(/['"]/g, '');
  }
}

const LOGOS_DIR = path.join(__dirname, '../public/bank-logos');
const BACKEND_JSON = path.join(__dirname, '../payment-gateway/src/config/nigerian_banks_logos.json');

function padCode(code) {
  let str = String(code).trim();
  if (/^\d+$/.test(str)) {
    return str.padStart(3, '0');
  }
  return str;
}

// Reusable HTTPS GET request
function fetchBanksFromFlutterwave(secretKey) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.flutterwave.com',
      path: '/v3/banks/NG',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.status === 'success' && Array.isArray(parsed.data)) {
            resolve(parsed.data);
          } else {
            reject(new Error(parsed.message || 'Failed to fetch banks from Flutterwave API'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.end();
  });
}

async function main() {
  let banks = [];
  let isLive = false;

  console.log("------------------------------------------------------------------------------------------------------------------------------");
  console.log("Initiating Repeatable Flutterwave Logo Coverage Verification...");
  console.log("------------------------------------------------------------------------------------------------------------------------------");

  if (flwSecretKey && !flwSecretKey.includes('xxxxxx')) {
    console.log(`[Source] Authentic FLW Secret Key found. Fetching live bank list directly from Flutterwave...`);
    try {
      banks = await fetchBanksFromFlutterwave(flwSecretKey);
      isLive = true;
      console.log(`[Success] Live bank list loaded. Received ${banks.length} banks from Flutterwave.`);
    } catch (err) {
      console.warn(`[Warning] Live Flutterwave API fetch failed: ${err.message}. Falling back to cached list.`);
    }
  }

  if (banks.length === 0) {
    console.log(`[Source] Falling back to backend cache of authentic Flutterwave bank list.`);
    if (fs.existsSync(BACKEND_JSON)) {
      const raw = fs.readFileSync(BACKEND_JSON, 'utf8');
      banks = JSON.parse(raw);
    } else {
      console.error(`[Error] Backend cache file not found at ${BACKEND_JSON}`);
      process.exit(1);
    }
  }

  const reportRows = [];
  let verifiedLogos = 0;
  let missingLogos = 0;
  const missingLogosList = [];
  const processedCodes = new Set();
  let duplicateCount = 0;

  banks.forEach((bank) => {
    if (!bank.code) return;

    const code = padCode(bank.code);

    // Check for duplicates
    if (processedCodes.has(code)) {
      duplicateCount++;
    } else {
      processedCodes.add(code);
    }

    const logoFileName = `${code}.png`;
    const localLogoPath = path.join(LOGOS_DIR, logoFileName);
    const hasLocalFile = fs.existsSync(localLogoPath);

    let status = "VERIFIED";
    let logoFound = "YES";
    let logoUrl = `/bank-logos/${logoFileName}`;

    if (!hasLocalFile) {
      status = "FALLBACK (No static logo file)";
      logoFound = "NO";
      logoUrl = "N/A";
      missingLogos++;
      missingLogosList.push(bank);
    } else {
      // Validate file size is non-zero
      const stats = fs.statSync(localLogoPath);
      if (stats.size === 0) {
        status = "BROKEN (0 bytes file)";
        logoFound = "NO";
        logoUrl = "N/A";
        missingLogos++;
        missingLogosList.push(bank);
      } else {
        verifiedLogos++;
      }
    }

    reportRows.push({
      code,
      name: bank.name,
      logoFound,
      logoUrl,
      status
    });
  });

  // Compile full text report
  let reportText = `==============================================================================================================================\n`;
  reportText += `REPEATABLE LOGO AUDIT REPORT (FLUTTERWAVE BASELINE)\n`;
  reportText += `==============================================================================================================================\n`;
  reportText += `BANK CODE | BANK NAME                                    | LOGO FOUND | LOGO URL                  | STATUS\n`;
  reportText += `==============================================================================================================================\n`;

  reportRows.forEach(row => {
    reportText += `${row.code.padEnd(9)} | ${row.name.padEnd(44)} | ${row.logoFound.padEnd(10)} | ${row.logoUrl.padEnd(25)} | ${row.status}\n`;
  });

  reportText += `==============================================================================================================================\n`;
  reportText += `AUDIT SUMMARY:\n`;
  reportText += `------------------------------------------------------------------------------------------------------------------------------\n`;
  reportText += `1. Total Flutterwave banks found: ${banks.length}\n`;
  reportText += `2. Total verified logos: ${verifiedLogos}\n`;
  reportText += `3. Total missing logos: ${missingLogos}\n`;
  reportText += `4. Total self-hosted logos: ${verifiedLogos}\n`;
  reportText += `5. Duplicate bank codes detected: ${duplicateCount}\n`;
  reportText += `6. Source mode: ${isLive ? 'LIVE FLUTTERWAVE API' : 'LOCAL BACKEND CACHE'}\n`;
  reportText += `------------------------------------------------------------------------------------------------------------------------------\n`;
  reportText += `7. List of remaining missing logos:\n`;
  missingLogosList.forEach((b) => {
    reportText += `   - [${padCode(b.code)}] ${b.name}\n`;
  });
  reportText += `==============================================================================================================================\n`;

  // Save report to audit_report.txt
  fs.writeFileSync(path.join(__dirname, '../audit_report.txt'), reportText, 'utf8');
  console.log(`[Success] Repeatable verification completed. Saved full report to audit_report.txt.`);
  console.log(`Summary: Total Banks = ${banks.length}, Verified Logos = ${verifiedLogos}, Missing Logos = ${missingLogos}`);
}

main().catch(console.error);
