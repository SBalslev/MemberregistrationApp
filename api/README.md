# ISS Skydning Sync API

PHP REST API for synchronizing membership data between laptop applications and the online MySQL database.

## Requirements

- PHP 8.1 or higher
- MySQL 5.7+ or MariaDB 10.3+
- PDO MySQL extension
- Apache with mod_rewrite (or nginx with equivalent config)

## Deployment

### 1. Upload Files

Upload the contents of this folder to your web hosting, e.g., `https://iss-skydning.dk/api/`

### 2. Create Config File

Copy `config.php.example` to `config.php` and update:

```bash
cp config.php.example config.php
chmod 600 config.php
```

Edit `config.php`:
- Set your database credentials
- Generate and set a strong API password hash:
  ```bash
  php -r "echo password_hash('your-secure-password', PASSWORD_BCRYPT, ['cost' => 12]);"
  ```
- Generate and set JWT secret:
  ```bash
  openssl rand -base64 32
  ```

### 3. Set Environment Variables (Recommended)

On your hosting control panel, set:
- `DB_PASSWORD` - Your MySQL password
- `JWT_SECRET` - Random 32+ character string

### 4. Create Database Tables

Run the SQL schema file via phpMyAdmin or MySQL client:
```bash
mysql -u username -p database_name < schema/V1_0_0__initial_schema.sql
```

### 5. Set File Permissions

```bash
chmod 600 config.php
chmod 700 logs/
chmod 644 *.php handlers/*.php
chmod 644 .htaccess
```

### 6. Test the API

```bash
# Health check
curl https://iss-skydning.dk/api/v1/health

# Get auth token
curl -X POST https://iss-skydning.dk/api/v1/auth/token \
  -H "Content-Type: application/json" \
  -d '{"password":"your-password","device_id":"test-uuid-1234-5678-90ab-cdef12345678"}'
```

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /v1/health | No | Health check |
| POST | /v1/auth/token | No | Get JWT token |
| GET | /v1/schema/version | Yes | Get schema version |
| POST | /v1/sync/push | Yes | Push data to server |
| GET | /v1/sync/pull | Yes | Pull data from server |
| GET | /v1/sync/status | Yes | Get sync status |
| POST | /v1/photos | Yes | Upload photo |
| GET | /v1/photos/{id} | Yes | Download photo |

## Security Features

- JWT token authentication (24h expiry)
- Login lockout after 5 failed attempts (15 min)
- Rate limiting (60 requests/min)
- Optional IP allowlist
- Security event logging
- API access audit trail

## Troubleshooting

### Authorization header not working

Some hosts strip the Authorization header. The `.htaccess` includes a workaround, but if it still doesn't work, try:

1. Add to `.htaccess`:
   ```apache
   SetEnvIf Authorization "(.*)" HTTP_AUTHORIZATION=$1
   ```

2. Or use query parameter: `?token=YOUR_TOKEN`

### Database connection fails

1. Check that your hosting allows localhost MySQL connections
2. Verify credentials in config.php
3. Check PHP error logs

### File upload fails

1. Check `upload_max_filesize` and `post_max_size` in PHP settings
2. Verify `LimitRequestBody` in .htaccess isn't too low
3. Check folder permissions

## Files

```
api/
├── index.php           # Entry point / router
├── config.php.example  # Config template
├── config.php          # Actual config (DO NOT COMMIT)
├── db.php              # Database connection
├── security.php        # Security functions
├── auth.php            # JWT helpers
├── handlers/
│   ├── auth.php        # Login endpoint
│   ├── schema.php      # Schema version
│   ├── sync_push.php   # Receive data
│   ├── sync_pull.php   # Send data
│   ├── sync_status.php # Sync status
│   └── photos.php      # Photo upload/download
├── logs/               # Security logs
├── schema/             # SQL migration files
├── .htaccess           # Apache config
└── .gitignore          # Git ignore rules
```
