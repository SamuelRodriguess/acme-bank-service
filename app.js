const sqlite3 = require("sqlite3");
const express = require("express");
const session = require("express-session");
const { body, validationResult } = require("express-validator");
const path = require("path");
const fs = require("fs");
const helmet = require("helmet");
const csurf = require("csurf");

const app = express();
const PORT = 3000;

// Security middleware to set HTTP headers
app.use(helmet());

// Serve static files safely
app.use(express.static(path.join(__dirname, "public")));

// Body parsing middleware with reasonable limits to prevent DoS via large payloads
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use(express.json({ limit: "10kb" }));

// Session configuration with secure cookies and recommended options
app.use(
  session({
    secret: process.env.SESSION_SECRET || "super-secret-key",
    resave: false, // don't save session if unmodified
    saveUninitialized: false, // only save session when set
    cookie: { secure: process.env.NODE_ENV === "production", httpOnly: true, sameSite: "lax" },
  })
);

// CSRF protection middleware configured with session support
app.use(csurf());

// Pass CSRF token to views for forms
app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken();
  next();
});

const db = new sqlite3.Database("./bank_sample.db");

// Routes

// Login page (send static file)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "html/login.html"));
});

// Validation rules for login fields
const loginValidation = [
  body("username").trim().notEmpty().withMessage("Username is required").escape(),
  body("password").trim().notEmpty().withMessage("Password is required").escape(),
];

// POST /auth - authentication with input validation and secure queries
app.post("/auth", loginValidation, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).send(errors.array()[0].msg); // send first validation error
  }

  const { username, password } = req.body;
  const query = `SELECT * FROM users WHERE username = ? AND password = ?`;

  db.get(query, [username, password], (error, user) => {
    if (error) {
      console.error("DB error on login:", error);
      return res.status(500).send("Server error");
    }
    if (!user) {
      return res.status(401).send("Incorrect Username and/or Password!");
    }

    // Set only minimal session info
    req.session.loggedin = true;
    req.session.username = user.username;
    req.session.balance = user.balance;
    req.session.file_history = user.file_history;
    req.session.account_no = user.account_no;

    res.redirect("/home");
  });
});

// GET /home - user dashboard, require login
app.get("/home", (req, res) => {
  if (!req.session.loggedin) return res.redirect("/");
  res.render("home_page", {
    username: req.session.username,
    balance: req.session.balance,
  });
});

// GET /transfer - render transfer page with CSRF token
app.get("/transfer", (req, res) => {
  if (!req.session.loggedin) return res.redirect("/");
  res.render("transfer", { sent: "", csrfToken: req.csrfToken() });
});

// POST /transfer - secure money transfer with validation and SQL parameterization
app.post(
  "/transfer",
  [
    body("account_to")
      .exists()
      .withMessage("Recipient account is required")
      .isInt({ gt: 0 })
      .withMessage("Recipient account must be a positive integer"),
    body("amount")
      .exists()
      .withMessage("Amount is required")
      .isFloat({ gt: 0 })
      .withMessage("Amount must be greater than zero"),
  ],
  (req, res) => {
    if (!req.session.loggedin) return res.redirect("/");
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.render("transfer", { sent: errors.array()[0].msg, csrfToken: req.csrfToken() });
    }

    const balance = req.session.balance;
    const account_to = parseInt(req.body.account_to);
    const amount = parseFloat(req.body.amount);
    const account_from = req.session.account_no;

    if (balance < amount) {
      return res.render("transfer", { sent: "You Don't Have Enough Funds.", csrfToken: req.csrfToken() });
    }

    db.serialize(() => {
      db.run(
        `UPDATE users SET balance = balance + ? WHERE account_no = ?`,
        [amount, account_to],
        (err1) => {
          if (err1) {
            console.error("Error updating recipient balance:", err1);
            return res.render("transfer", { sent: "Transfer failed.", csrfToken: req.csrfToken() });
          }
          db.run(
            `UPDATE users SET balance = balance - ? WHERE account_no = ?`,
            [amount, account_from],
            (err2) => {
              if (err2) {
                console.error("Error updating sender balance:", err2);
                return res.render("transfer", { sent: "Transfer failed.", csrfToken: req.csrfToken() });
              }
              req.session.balance -= amount;
              res.render("transfer", { sent: "Money Transferred", csrfToken: req.csrfToken() });
            }
          );
        }
      );
    });
  }
);

// GET /download - render download page for user file history
app.get("/download", (req, res) => {
  if (!req.session.loggedin) return res.redirect("/");
  res.render("download", { file_name: req.session.file_history, csrfToken: req.csrfToken() });
});

// POST /download - secure file download, prevent path traversal with basename
app.post("/download", (req, res) => {
  if (!req.session.loggedin) return res.redirect("/");
  const file_name = req.body.file;
  if (!file_name) return res.status(400).send("No file specified");

  const safeFileName = path.basename(file_name);
  const filePath = path.join(__dirname, "history_files", safeFileName);

  fs.readFile(filePath, "utf8", (err, content) => {
    if (err) {
      console.error("File read error:", err);
      return res.status(404).send("File not found");
    }
    res.type("text/plain").send(content);
  });
});

// GET /public_forum - show forum messages with escaping in views to prevent XSS
app.get("/public_forum", (req, res) => {
  if (!req.session.loggedin) return res.redirect("/");
  db.all(`SELECT username, message FROM public_forum`, (err, rows) => {
    if (err) {
      console.error("Forum load error:", err);
      return res.send("Error loading forum");
    }
    res.render("forum", { rows });
  });
});

// POST /public_forum - insert comment using parameterized queries
app.post(
  "/public_forum",
  body("comment").trim().notEmpty().escape().withMessage("Comment cannot be empty"),
  (req, res) => {
    if (!req.session.loggedin) return res.redirect("/");

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Return forum with error message
      return db.all(`SELECT username, message FROM public_forum`, (err, rows) => {
        if (err) {
          console.error("Forum load error:", err);
          return res.send("Error loading forum");
        }
        return res.render("forum", { rows, error: errors.array()[0].msg });
      });
    }

    const comment = req.body.comment;
    const username = req.session.username;

    db.run(
      `INSERT INTO public_forum (username, message) VALUES (?, ?)`,
      [username, comment],
      (err) => {
        if (err) {
          console.error("Insert comment error:", err);
          return res.send("Error posting comment");
        }
        db.all(`SELECT username, message FROM public_forum`, (err, rows) => {
          if (err) {
            console.error("Forum load error:", err);
            return res.send("Error loading forum");
          }
          res.render("forum", { rows });
        });
      }
    );
  }
);

// GET /public_ledger - safe ledger query with parameterized id
app.get("/public_ledger", (req, res) => {
  if (!req.session.loggedin) return res.redirect("/");

  if (req.query.id) {
    db.all(
      `SELECT * FROM public_ledger WHERE from_account = ?`,
      [req.query.id],
      (err, rows) => {
        if (err) {
          console.error("Ledger query error:", err);
          return res.send("Error loading ledger");
        }
        res.render("ledger", { rows });
      }
    );
  } else {
    db.all(`SELECT * FROM public_ledger`, (err, rows) => {
      if (err) {
        console.error("Ledger load error:", err);
        return res.send("Error loading ledger");
      }
      res.render("ledger", { rows });
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
