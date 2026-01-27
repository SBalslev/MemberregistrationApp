# MySQL Connectivity Analysis

**Priority:** HIGH - Must resolve before implementation
**Status:** RESOLVED - PHP API required

## Test Results (2026-01-27)

```
Port 443 (HTTPS): OPEN   - Website reachable
Port 3306 (MySQL): CLOSED - Direct access blocked
```

**Decision:** Implement PHP API layer for database access

---

## 1. Connection Details to Test

| Parameter | Value | Notes |
|-----------|-------|-------|
| Host | `iss-skydning.dk` | Without `.mysql` suffix |
| Port | `3306` | Standard MySQL port |
| Database | `iss_skydning_dkisssportsskytter` | |
| Username | `iss_skydning_dkisssportsskytter` | |
| Password | *user provided* | |

## 2. Test Scenarios

### Scenario A: Direct MySQL Access Works
If the hosting provider allows external MySQL connections:
- Proceed with current design (mysql2 driver in Electron)
- Verify SSL/TLS is available
- Document any IP whitelisting requirements

### Scenario B: Direct Access Blocked (Likely)
Most shared web hosts block external MySQL connections for security.
If this is the case, we need a **PHP API layer**:

```
Laptop App → HTTPS → PHP API (iss-skydning.dk) → MySQL (localhost)
```

**Implications:**
- Need to design REST API endpoints
- PHP files deployed to web hosting
- Authentication via API key or token
- All queries go through HTTP, not direct MySQL

---

## 3. Manual Test Steps

### Step 1: Check if port 3306 is reachable

From command prompt:
```bash
# Windows
telnet iss-skydning.dk 3306

# Or using PowerShell
Test-NetConnection -ComputerName iss-skydning.dk -Port 3306
```

### Step 2: Try MySQL client connection

If you have MySQL client installed:
```bash
mysql -h iss-skydning.dk -u iss_skydning_dkisssportsskytter -p
```

### Step 3: Check hosting provider documentation

- Log into the hosting control panel
- Look for "Remote MySQL" or "MySQL Access Hosts"
- Check if external connections need to be enabled
- Some hosts require adding your IP to an allowlist

---

## 4. PHP API Fallback Design

If direct access is blocked, we need these PHP endpoints:

### 4.1 API Structure

```
https://iss-skydning.dk/api/
├── connect.php          # Test connection
├── schema-version.php   # Get/check schema version
├── sync/
│   ├── push.php         # Receive data from laptop
│   ├── pull.php         # Send data to laptop
│   └── status.php       # Sync status
└── auth/
    └── verify.php       # API key verification
```

### 4.2 Authentication

**Option 1: API Key (Simple)**
- Static API key stored in laptop app (encrypted)
- Sent as header: `X-API-Key: <key>`
- Pro: Simple
- Con: Key rotation requires app update

**Option 2: Password-based Token (Better)**
- Laptop sends password, receives short-lived token
- Token used for subsequent requests
- Aligns with current design (password entered by user)

### 4.3 Example PHP Endpoint

```php
<?php
// api/sync/push.php
header('Content-Type: application/json');

// Verify auth
$apiKey = $_SERVER['HTTP_X_API_KEY'] ?? '';
if ($apiKey !== getenv('SYNC_API_KEY')) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

// Database connection (localhost because same server)
$pdo = new PDO(
    'mysql:host=localhost;dbname=iss_skydning_dkisssportsskytter;charset=utf8mb4',
    'iss_skydning_dkisssportsskytter',
    getenv('DB_PASSWORD')
);

// Process incoming data
$input = json_decode(file_get_contents('php://input'), true);
$result = processSyncPayload($pdo, $input);

echo json_encode($result);
```

### 4.4 Laptop App Changes for PHP API

If PHP API is needed, changes to technical design:

| Component | Direct MySQL | PHP API |
|-----------|--------------|---------|
| `mysqlService.cjs` | mysql2 driver | fetch/axios HTTP |
| Connection | TCP 3306 | HTTPS 443 |
| Queries | SQL strings | REST endpoints |
| Transactions | Native | API must handle |
| Binary photos | BLOB insert | multipart/form-data |

---

## 5. Decision Matrix

| Factor | Direct MySQL | PHP API |
|--------|--------------|---------|
| Complexity | Lower | Higher |
| Security | Needs SSL config | HTTPS built-in |
| Performance | Faster | HTTP overhead |
| Hosting compatibility | Often blocked | Always works |
| Maintenance | Just app | App + PHP code |
| Firewall issues | Possible | Unlikely |

**Recommendation:** Test direct access first. If blocked, PHP API is the reliable fallback.

---

## 6. Action Items

- [ ] **Test 1:** Run `Test-NetConnection -ComputerName iss-skydning.dk -Port 3306`
- [ ] **Test 2:** Check hosting control panel for "Remote MySQL" settings
- [ ] **Test 3:** If remote access can be enabled, try mysql client connection
- [ ] **Decision:** Direct MySQL vs PHP API based on test results
- [ ] **Update:** Technical design based on decision

---

## 7. Questions for Hosting Provider

If tests fail, contact hosting support with:

1. Can I enable remote MySQL access for database `iss_skydning_dkisssportsskytter`?
2. Is there an IP allowlist for MySQL connections?
3. Is SSL/TLS available for MySQL connections?
4. What are the rate limits for database connections?
5. Is there a recommended way to access the database from external applications?
