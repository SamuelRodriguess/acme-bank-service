const sqlite3 = require("sqlite3");
const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const { body, check, validationResult } = require("express-validator");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const db = new sqlite3.Database("./db/bank_sample.db");
const csurf = require("csurf");
const cookieParser = require("cookie-parser");

const app = express();
const PORT = 3000;
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use(helmet());

app.use(
  session({
    secret: "secret",
    resave: true,
    saveUninitialized: true,
  })
);

app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

const csfMiddleware = csurf({
  cookie: {
    httpOnly: true,
    sameSite: "lax" // ou "strict"
  },
});

app.use((error, request, response, next) =>{
  if (error.code !== "EBADCSRFTOKEN") {
    return next();
  }
  response.status(403);
  response.send("The token is invalid");
});

app.get("/", function (request, response) {
  response.sendFile(path.join(__dirname + "/html/login.html"));
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Muitas tentativas de login, tente novamente depois.",
});

const loginValidation = [
  body("username")
    .trim()
    .notEmpty()
    .withMessage("Username is required")
    .escape(),
  body("password").trim().notEmpty().withMessage("Password is required"),
];

app.post("/auth", loginLimiter, loginValidation, (request, response) => {
  const errors = validationResult(request);
  if (!errors.isEmpty()) {
    return res.status(400).send("Incorrect Username and/or Password!");
  }
  const { username, password } = request.body;
  db.get(
    `SELECT * FROM users WHERE username = ? AND password = ?`,
    [username, password],
    (error, results) => {
      if (results) {
        request.session.loggedin = true;
        request.session.username = results["username"];
        request.session.balance = results["balance"];
        request.session.file_history = results["file_history"];
        request.session.account_no = results["account_no"];
        response.redirect("/home");
      } else {
        response.send("Incorrect Username and/or Password!");
      }
      response.end();
    }
  );
});

app.get("/home", function (request, response) {
  if (!request.session.loggedin) {
    return response.redirect("/");
  }

  const balanceUser = {
    username: request.session.username,
    balance: request.session.balance,
  };

  response.render("home_page", balanceUser);
});

app.get("/transfer", csfMiddleware, function (request, response) {
  if (!request.session.loggedin) {
    return response.redirect("/");
  }
  const sent = { sent: "", csrfToken: request.csrfToken() };
  response.render("transfer", sent);
});

const transferValidation = [
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
];

app.post("/transfer", csfMiddleware, transferValidation, (request, response) => {
  if (!request.session.loggedin) {
    return response.redirect("/");
  }
  const balance = request.session.balance;
  const account_to = parseInt(request.body.account_to);
  const amount = parseInt(request.body.amount);
  const account_from = request.session.account_no;

  if (!account_to || !amount) {
    return response.render("transfer", { sent: "", csrfToken: request.csrfToken() });
  }

  if (balance <= amount) {
    return response.render("transfer", {
      sent: "You Don't Have Enough Funds.",
      csrfToken: request.csrfToken()
    });
  }
  // Use serialize to execute queries sequentially inside a transaction
  db.serialize(() => {
    // Start transaction to ensure atomicity
    db.run("BEGIN TRANSACTION");
    // Debit amount from sender's account
    db.run(
      `UPDATE users SET balance = balance - ? WHERE account_no = ?`,
      [amount, account_from],
      (error) => {
        if (error) {
          db.run("ROLLBACK");
          return response.render("transfer", {
            sent: "Error processing transfer.",
            csrfToken: request.csrfToken()
          });
        }
        db.run(
          `UPDATE users SET balance = balance + ? WHERE account_no = ?`,
          [amount, account_to],
          (error) => {
            if (error) {
              db.run("ROLLBACK");
              return response.render("transfer", {
                sent: "Error processing transfer.",
                csrfToken: request.csrfToken()
              });
            }
            db.run("COMMIT");
            return response.render("transfer", { sent: "Money Transferred", csrfToken: request.csrfToken() } );
          }
        );
      }
    );
  });
});

app.get("/download", function (request, response) {
  if (!request.session.loggedin) {
    return response.redirect("/");
  }
  response.render("download", { file_name: request.session.file_history });
});

const downloadValidation = [
  body("file")
    .exists()
    .withMessage("No file specified")
    .bail()
    .matches(/^[a-zA-Z0-9_\-\.]+$/)
    .withMessage("Invalid file name"),
];

app.post("/download", downloadValidation, (request, response) => {
  if (!request.session.loggedin) {
    return response.redirect("/");
  }
  const errors = validationResult(request);
  if (!errors.isEmpty()) {
    return response.status(400).json({ errors: errors.array() });
  }

  const file_name = request.body.file;
  const safeFileName = path.basename(file_name);
  const filePath = path.join(__dirname, "history_files", safeFileName);

  if (!filePath.startsWith(path.join(__dirname, "history_files"))) {
    return response.status(400).send("Invalid access");
  }

  fs.readFile(filePath, "utf8", (err, content) => {
    if (err) {
      return response.status(404).send("File not found");
    }
    response.type("text/plain").send(content);
  });
});

app.get("/public_forum", function (request, response) {
  if (!request.session.loggedin) {
    return response.redirect("/");
  }
  db.all(`SELECT username,message FROM public_forum`, (err, rows) => {
    console.log(rows);
    console.log(err);
    response.render("forum", { rows });
  });
});

app.post(
  "/public_forum",
  body("comment")
    .trim()
    .notEmpty()
    .withMessage("Comment cannot be empty")
    .escape(),
  (request, response) => {
    if (!request.session.loggedin) {
      return response.redirect("/");
    }

    const errors = validationResult(request);
    if (!errors.isEmpty()) {
      return db.all(
        `SELECT username, message FROM public_forum`,
        (err, rows) => {
          if (err) {
            console.error("Forum load error:", err);
            return request.send("Error loading forum");
          }
          return request.render("forum", {
            rows,
            error: errors.array()[0].msg,
          });
        }
      );
    }

    const comment = request.body.comment;
    const username = request.session.username;

    db.run(
      `INSERT INTO public_forum (username, message) VALUES (?, ?)`,
      [username, comment],
      (err) => {
        if (err) {
          return response.send("Error posting comment");
        }
        db.all(`SELECT username, message FROM public_forum`, (err, rows) => {
          if (err) {
            return response.send("Error loading forum");
          }
          response.render("forum", { rows });
        });
      }
    );
  }
);

app.get(
  "/public_ledger",
  check("id").optional().isInt().withMessage("id must be an integer"),
  (request, response) => {
    if (!request.session.loggedin) {
      return response.redirect("/");
    }

    const errors = validationResult(request);
    if (!errors.isEmpty()) {
      return response.status(400).json({ errors: errors.array() });
    }

    if (request.query.id) {
      db.all(
        `SELECT * FROM public_ledger WHERE from_account = ?`,
        [request.query.id],
        (err, rows) => {
          if (err) {
            return response.send("Error loading ledger");
          }
          response.render("ledger", { rows });
        }
      );
      return response.end();
    }

    db.all(`SELECT * FROM public_ledger`, (err, rows) => {
      if (err) {
        return response.send("Error loading ledger");
      }
      response.render("ledger", { rows });
    });
  }
);

app.listen(PORT, () => {
  console.log(`Server is running on port: ${PORT}`);
});
