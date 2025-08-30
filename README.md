# Acme bank service
<img width="840" height="600" alt="image" src="https://github.com/user-attachments/assets/f2a776e0-9310-4b03-b29d-3771aedf4c34" />

## Description
This is a Node.js service built with Express.js that manages core banking functionalities including money transfers, user account management, a public forum, and user comments.
The application uses SQLite3 for lightweight database management, providing persistence for user data, transactions, and forum posts. It incorporates transactional integrity
for secure money transfers.
## Features
- User session management with login validation
- Public forum where authenticated users can post comments
- Public ledger view with optional filtering by account
- Secure file download with input validation
- Input validation using express-validator for security and data integrity
- SQL transactions to ensure atomic money transfers

## Prerequisites
- Node.js (v18 or higher recommended)
- npm (Node Package Manager)
- SQLite3 database
- Express.js

## Installation
1. Clone the repository:
   ```git clone https://github.com/SamuelRodriguess/acme-bank-service/new/main```

2. Install dependencies:
   ```yarn install```

## Usage
1. Start the server:
   ```yarn start```
2. Visit `http://localhost:3000` in your browser.
3. Register or log in, then use the public forum, initiate transfers, access the ledger, or download files.

## Important Endpoints
- POST `/auth` - user login
- POST `/transfer` - transfer money between accounts (uses SQL transactions)
- GET `/public_ledger` - view ledger entries with optional query parameter to filter by account
- POST `/public_forum` - post comments to the forum (with validation)
- POST `/download` - download files securely (validated and sanitized)

## Validation and Security
- All user inputs are validated and sanitized using `express-validator`
- Sensitive operations like transfers use SQL transactions (`BEGIN TRANSACTION`, `COMMIT`, `ROLLBACK`) for data integrity
- User sessions are checked at protected routes to prevent unauthorized access
- File accesses are sanitized to prevent path traversal attacks

## Project Structure
- `app.js` - main Express app and routes
- `db/` - SQLite database files and queries
- `views/` - templates for rendering pages (e.g., forum, ledger)
- `middlewares/` - express-validator middlewares and custom authentication checks
- 
## App
  <table>
  <tr>
    <td><img src="https://github.com/user-attachments/assets/f2af4c98-7adf-42d1-a334-e8538f91d0f1" width="500"></td>
    <td><img width="500"  alt="image" src="https://github.com/user-attachments/assets/989fff03-c1a0-4c90-ad13-4b5ba7821fd0" /></td></tr>
    <tr> <td><img width="500"height="599" alt="image" src="https://github.com/user-attachments/assets/f4f351ec-5a33-43fa-9ec2-507eafba006d" /></td>
    <td><img  width="500"height="355" alt="image" src="https://github.com/user-attachments/assets/81a5b034-b351-42d3-b781-1a27ed1ca584" /></td></tr>
</tr>
</table>

## License
MIT License © 2025
