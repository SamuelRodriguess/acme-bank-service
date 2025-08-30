const { body, validationResult } = require("express-validator");
const db = require("../config/db");

const loginValidation = [
  body("username").trim().notEmpty().withMessage("Username is required").escape(),
  body("password").trim().notEmpty().withMessage("Password is required"),
];

const login = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).send("Incorrect Username and/or Password!");
  }
  const { username, password } = req.body;
  db.get(
    `SELECT * FROM users WHERE username = ? AND password = ?`,
    [username, password],
    (error, results) => {
      if (results) {
        req.session.loggedin = true;
        req.session.username = results["username"];
        req.session.balance = results["balance"];
        req.session.file_history = results["file_history"];
        req.session.account_no = results["account_no"];
        res.redirect("/home");
      } else {
        res.send("Incorrect Username and/or Password!");
      }
      res.end();
    }
  );
};

module.exports = {
  loginValidation,
  login,
};
