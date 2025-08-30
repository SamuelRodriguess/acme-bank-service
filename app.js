const sqlite3 = require("sqlite3");
const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const { body, validationResult } = require("express-validator");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const db = new sqlite3.Database("./db/bank_sample.db");

const app = express();
const PORT = 3000;
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use(helmet());
app.use(
  session({
    secret: "secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
    },
  })
);

app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use(express.json({ limit: "10kb" }));

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
    (error, results) =>{
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

//Home Menu No Exploits Here.
app.get("/home", function (request, response) {
  if (request.session.loggedin) {
    username = request.session.username;
    balance = request.session.balance;
    response.render("home_page", { username, balance });
  } else {
    response.redirect("/");
  }
  response.end();
});

//CSRF CODE SECURED. SEE HEADERS SET ABOVE
app.get("/transfer", function (request, response) {
  if (request.session.loggedin) {
    const sent = "";
    response.render("transfer", { sent });
  } else {
    response.redirect("/");
  }
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
  ]

app.post("/transfer", transferValidation, (request, response) => {
  if (!request.session.loggedin) {
    return response.redirect("/");
  }
  const balance = request.session.balance;
  const account_to = parseInt(request.body.account_to);
  const amount = parseInt(request.body.amount);
  const account_from = request.session.account_no;

  if (!account_to || !amount) {
    return response.render("transfer", { sent: "" });
  }

  if (balance <= amount) {
    return response.render("transfer", { sent: "You Don't Have Enough Funds." });
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
          return response.render("transfer", { sent: "Error processing transfer." });
        }
        db.run(
          `UPDATE users SET balance = balance + ? WHERE account_no = ?`,
          [amount, account_to],
          (error) => {
            if (error) {
              db.run("ROLLBACK");
              return response.render("transfer", { sent: "Error processing transfer." });
            }
            db.run("COMMIT");
            return response.render("transfer", { sent: "Money Transferred" });
          }
        );
      }
    );
  });
});


//PATH TRAVERSAL CODE
app.get("/download", function (request, response) {
  if (request.session.loggedin) {
    file_name = request.session.file_history;
    response.render("download", { file_name });
  } else {
    response.redirect("/");
  }
  response.end();
});

app.post("/download", function (request, response) {
  if (request.session.loggedin) {
    const file_name = request.body.file;

    response.statusCode = 200;
    response.setHeader("Content-Type", "text/html");

    // Change the filePath to current working directory using the "path" method
    const filePath = "history_files/" + file_name;
    console.log(filePath);
    try {
      content = fs.readFileSync(filePath, "utf8");
      response.end(content);
    } catch (err) {
      console.log(err);
      response.end("File not found");
    }
  } else {
    response.redirect("/");
  }
  response.end();
});

//XSS CODE
app.get("/public_forum", function (request, response) {
  if (request.session.loggedin) {
    db.all(`SELECT username,message FROM public_forum`, (err, rows) => {
      console.log(rows);
      console.log(err);
      response.render("forum", { rows });
    });
  } else {
    response.redirect("/");
  }
  //response.end();
});

app.post("/public_forum", function (request, response) {
  if (request.session.loggedin) {
    const comment = request.body.comment;
    const username = request.session.username;
    if (comment) {
      db.all(
        `INSERT INTO public_forum (username,message) VALUES ('${username}','${comment}')`,
        (err, rows) => {
          console.log(err);
        }
      );
      db.all(`SELECT username,message FROM public_forum`, (err, rows) => {
        console.log(rows);
        console.log(err);
        response.render("forum", { rows });
      });
    } else {
      db.all(`SELECT username,message FROM public_forum`, (err, rows) => {
        console.log(rows);
        console.log(err);
        response.render("forum", { rows });
      });
    }
    comment = "";
  } else {
    response.redirect("/");
  }
  comment = "";
  //response.end();
});

//SQL UNION INJECTION
app.get("/public_ledger", function (request, response) {
  if (request.session.loggedin) {
    const id = request.query.id;
    if (id) {
      db.all(
        `SELECT * FROM public_ledger WHERE from_account = '${id}'`,
        (err, rows) => {
          console.log("PROCESSING INPU");
          console.log(err);
          if (rows) {
            response.render("ledger", { rows });
          } else {
            response.render("ledger", { rows });
          }
        }
      );
    } else {
      db.all(`SELECT * FROM public_ledger`, (err, rows) => {
        if (rows) {
          response.render("ledger", { rows });
        } else {
          response.render("ledger", { rows });
        }
      });
    }
  } else {
    response.redirect("/");
  }
  //response.end();
});

app.listen(PORT, () => {
  console.log(`Server is running on port: ${PORT}`);
});
