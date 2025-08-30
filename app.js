const sqlite3 = require("sqlite3");
const express = require("express");
const session = require("express-session");
const { body, validationResult } = require("express-validator");
const path = require("path");
const fs = require("fs");
const helmet = require("helmet");
const csurf = require("csurf");
const bcrypt = require("bcrypt");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = 3000;

app.use(helmet());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use(express.json({ limit: "10kb" }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "super-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
    },
  })
);

app.use(csurf());

app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken();
  next();
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Muitas tentativas de login, tente novamente depois.",
});

const db = new sqlite3.Database("./db/bank_sample.db");

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "html/login.html"));
});

const loginValidation = [
  body("username").trim().notEmpty().withMessage("Username is required").escape(),
  body("password").trim().notEmpty().withMessage("Password is required"),
];

app.post("/auth", loginLimiter, loginValidation, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).send(errors.array()[0].msg);
  }

  const { username, password } = req.body;

  db.get("SELECT * FROM users WHERE username = ?", [username], async (error, user) => {
    if (error) {
      console.error("DB error on login:", error);
      return res.status(500).send("Server error");
    }
    if (!user) {
      return res.status(401).send("Incorrect Username and/or Password!");
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).send("Incorrect Username and/or Password!");
    }

    req.session.loggedin = true;
    req.session.username = user.username;
    req.session.file_history = user.file_history;
    req.session.account_no = user.account_no;

    res.redirect("/home");
  });
});

app.get("/home", (req, res) => {
  if (!req.session.loggedin) return res.redirect("/");

  db.get("SELECT balance FROM users WHERE username = ?", [req.session.username], (err, row) => {
    if (err) {
      console.error("DB error on /home:", err);
      return res.status(500).send("Server error");
    }
    if (!row) {
      return res.status(404).send("User not found");
    }

    res.render("home_page", {
      username: req.session.username,
      balance: row.balance,
    });
  });
});

app.get("/transfer", (req, res) => {
  if (!req.session.loggedin) return res.redirect("/");
  res.render("transfer", { sent: "", csrfToken: req.csrfToken() });
});

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

    const account_from = req.session.account_no;
    const account_to = parseInt(req.body.account_to);
    const amount = parseFloat(req.body.amount);

    db.get("SELECT balance FROM users WHERE account_no = ?", [account_from], (err, row) => {
      if (err) {
        console.error("DB error fetching balance:", err);
        return res.render("transfer", { sent: "Server error", csrfToken: req.csrfToken() });
      }
      if (!row) {
        return res.render("transfer", { sent: "Invalid sender account", csrfToken: req.csrfToken() });
      }

      if (row.balance < amount) {
        return res.render("transfer", { sent: "Insufficient funds.", csrfToken: req.csrfToken() });
      }

      db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        db.run(
          "UPDATE users SET balance = balance + ? WHERE account_no = ?",
          [amount, account_to],
          function (err1) {
            if (err1 || this.changes === 0) {
              console.error("Error updating recipient balance:", err1);
              db.run("ROLLBACK");
              return res.render("transfer", { sent: "Transfer failed (recipient).", csrfToken: req.csrfToken() });
            }

            db.run(
              "UPDATE users SET balance = balance - ? WHERE account_no = ?",
              [amount, account_from],
              function (err2) {
                if (err2 || this.changes === 0) {
                  console.error("Error updating sender balance:", err2);
                  db.run("ROLLBACK");
                  return res.render("transfer", { sent: "Transfer failed (sender).", csrfToken: req.csrfToken() });
                }

                db.run("COMMIT", (commitErr) => {
                  if (commitErr) {
                    console.error("Error committing transaction:", commitErr);
                    db.run("ROLLBACK");
                    return res.render("transfer", { sent: "Transfer failed.", csrfToken: req.csrfToken() });
                  }

                  res.render("transfer", { sent: "Money Transferred", csrfToken: req.csrfToken() });
                });
              }
            );
          }
        );
      });
    });
  }
);

app.get("/download", (req, res) => {
  if (!req.session.loggedin) return res.redirect("/");
  res.render("download", { file_name: req.session.file_history, csrfToken: req.csrfToken() });
});

app.post("/download", (req, res) => {
  if (!req.session.loggedin) return res.redirect("/");

  let file_name = req.body.file;
  if (!file_name) return res.status(400).send("No file specified");

  if (!/^[a-zA-Z0-9_\-\.]+$/.test(file_name)) {
    return res.status(400).send("Invalid file name");
  }

  const safeFileName = path.basename(file_name);
  const filePath = path.join(__dirname, "history_files", safeFileName);

  if (!filePath.startsWith(path.join(__dirname, "history_files"))) {
    return res.status(400).send("Invalid access");
  }

  fs.readFile(filePath, "utf8", (err, content) => {
    if (err) {
      console.error("File read error:", err);
      return res.status(404).send("File not found");
    }
    res.type("text/plain").send(content);
  });
});

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

app.post(
  "/public_forum",
  body("comment").trim().notEmpty().withMessage("Comment cannot be empty").escape(),
  (req, res) => {
    if (!req.session.loggedin) return res.redirect("/");

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
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
